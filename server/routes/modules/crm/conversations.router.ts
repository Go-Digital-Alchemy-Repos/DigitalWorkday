import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { requireAuth } from "../../../auth";
import { clientMessageRateLimiter } from "../../../middleware/rateLimit";
import {
  clientConversations,
  clientMessages,
  clients,
  users,
  UserRole,
  ClientMessageVisibility,
} from "@shared/schema";
import { getCurrentUserId } from "../../helpers";
import { verifyClientTenancy } from "./crm.helpers";
import { emitToTenant, emitToUser } from "../../../realtime/socket";
import { emitNotificationNew } from "../../../realtime/events";
import { storage } from "../../../storage";
import { CLIENT_CONVERSATION_EVENTS } from "@shared/events";
import type { NotificationPayload } from "@shared/events";

const router = Router();

router.get("/crm/clients/:clientId/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const assignedFilter = req.query.assigned as string | undefined;
    const userId = getCurrentUserId(req);

    let whereCondition = and(
      eq(clientConversations.clientId, clientId),
      eq(clientConversations.tenantId, tenantId)
    );

    const results = await db.select({
      conversation: clientConversations,
      creatorName: users.name,
    })
      .from(clientConversations)
      .leftJoin(users, eq(clientConversations.createdByUserId, users.id))
      .where(whereCondition)
      .orderBy(desc(clientConversations.updatedAt));

    const convosWithMeta = await Promise.all(results.map(async (r) => {
      const [msgCount] = await db.select({ value: count() })
        .from(clientMessages)
        .where(eq(clientMessages.conversationId, r.conversation.id));

      const [lastMsg] = await db.select({
        bodyText: clientMessages.bodyText,
        createdAt: clientMessages.createdAt,
        authorName: users.name,
      })
        .from(clientMessages)
        .leftJoin(users, eq(clientMessages.authorUserId, users.id))
        .where(eq(clientMessages.conversationId, r.conversation.id))
        .orderBy(desc(clientMessages.createdAt))
        .limit(1);

      let assigneeName: string | null = null;
      if (r.conversation.assignedToUserId) {
        const [assignee] = await db.select({ name: users.name })
          .from(users)
          .where(and(eq(users.id, r.conversation.assignedToUserId), eq(users.tenantId, tenantId)))
          .limit(1);
        assigneeName = assignee?.name || null;
      }

      return {
        ...r.conversation,
        creatorName: r.creatorName || "Unknown",
        assigneeName,
        messageCount: msgCount?.value || 0,
        lastMessage: lastMsg || null,
      };
    }));

    let filtered = convosWithMeta;
    if (assignedFilter === "me") {
      filtered = convosWithMeta.filter(c => c.assignedToUserId === userId);
    } else if (assignedFilter === "unassigned") {
      filtered = convosWithMeta.filter(c => !c.assignedToUserId);
    }

    res.json(filtered);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/conversations", req);
  }
});

router.post("/crm/clients/:clientId/conversations", requireAuth, clientMessageRateLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Clients cannot start conversations — use the reply endpoint instead"), req);
    }

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const schema = z.object({
      subject: z.string().min(1).max(200),
      projectId: z.string().optional(),
      initialMessage: z.string().min(1),
      assignedToUserId: z.string().optional(),
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const userId = getCurrentUserId(req);

    const assigneeId = data.assignedToUserId || userId;

    if (assigneeId !== userId) {
      const [targetUser] = await db.select({ id: users.id, tenantId: users.tenantId, role: users.role })
        .from(users)
        .where(eq(users.id, assigneeId))
        .limit(1);
      if (!targetUser || targetUser.tenantId !== tenantId) {
        return sendError(res, AppError.badRequest("Invalid user for this tenant"), req);
      }
      if (targetUser.role === "client") {
        return sendError(res, AppError.badRequest("Cannot assign conversations to client users"), req);
      }
    }

    const [conversation] = await db.insert(clientConversations).values({
      tenantId,
      clientId,
      projectId: data.projectId || null,
      subject: data.subject,
      createdByUserId: userId,
      assignedToUserId: assigneeId,
    }).returning();

    await db.insert(clientMessages).values({
      tenantId,
      conversationId: conversation.id,
      authorUserId: userId,
      bodyText: data.initialMessage,
    });

    if (assigneeId !== userId) {
      try {
        const notification = await storage.createNotification({
          tenantId,
          userId: assigneeId,
          type: "task_assigned",
          title: "New conversation assigned",
          message: `You have been assigned to conversation: "${conversation.subject}"`,
          payloadJson: { conversationId: conversation.id, clientId } as any,
        });
        emitNotificationNew(assigneeId, {
          id: notification.id,
          tenantId: notification.tenantId,
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          payloadJson: notification.payloadJson,
          readAt: notification.readAt,
          createdAt: notification.createdAt,
        });
      } catch {}

      emitToUser(assigneeId, CLIENT_CONVERSATION_EVENTS.ASSIGNED, {
        conversationId: conversation.id,
        tenantId,
        clientId,
        subject: conversation.subject,
        assignedToUserId: assigneeId,
        assignedByUserId: userId,
      });
    }

    res.status(201).json(conversation);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/conversations", req);
  }
});

router.patch("/crm/conversations/:conversationId/assign", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Clients cannot assign conversations"), req);
    }

    const { conversationId } = req.params;

    const [conversation] = await db.select()
      .from(clientConversations)
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)))
      .limit(1);

    if (!conversation) return sendError(res, AppError.notFound("Conversation"), req);

    const schema = z.object({
      assignedToUserId: z.string().nullable(),
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    if (data.assignedToUserId) {
      const [targetUser] = await db.select({ id: users.id, tenantId: users.tenantId, role: users.role })
        .from(users)
        .where(eq(users.id, data.assignedToUserId))
        .limit(1);
      if (!targetUser || targetUser.tenantId !== tenantId) {
        return sendError(res, AppError.badRequest("Invalid user for this tenant"), req);
      }
      if (targetUser.role === "client") {
        return sendError(res, AppError.badRequest("Cannot assign conversations to client users"), req);
      }
    }

    const previousAssignee = conversation.assignedToUserId;
    const [updated] = await db.update(clientConversations)
      .set({
        assignedToUserId: data.assignedToUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)))
      .returning();

    const userId = getCurrentUserId(req);

    emitToTenant(tenantId, CLIENT_CONVERSATION_EVENTS.ASSIGNED, {
      conversationId,
      tenantId,
      clientId: conversation.clientId,
      subject: conversation.subject,
      assignedToUserId: data.assignedToUserId,
      assignedByUserId: userId,
    });

    if (data.assignedToUserId && data.assignedToUserId !== userId && data.assignedToUserId !== previousAssignee) {
      try {
        const notification = await storage.createNotification({
          tenantId,
          userId: data.assignedToUserId,
          type: "task_assigned",
          title: "Conversation assigned to you",
          message: `You have been assigned to conversation: "${conversation.subject}"`,
          payloadJson: { conversationId, clientId: conversation.clientId } as any,
        });
        emitNotificationNew(data.assignedToUserId, {
          id: notification.id,
          tenantId: notification.tenantId,
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          payloadJson: notification.payloadJson,
          readAt: notification.readAt,
          createdAt: notification.createdAt,
        });
      } catch {}
    }

    let assigneeName: string | null = null;
    if (updated.assignedToUserId) {
      const [assignee] = await db.select({ name: users.name })
        .from(users)
        .where(and(eq(users.id, updated.assignedToUserId), eq(users.tenantId, tenantId)))
        .limit(1);
      assigneeName = assignee?.name || null;
    }

    res.json({ ...updated, assigneeName });
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/conversations/:conversationId/assign", req);
  }
});

router.get("/crm/conversations/:conversationId/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { conversationId } = req.params;

    const [conversation] = await db.select()
      .from(clientConversations)
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)))
      .limit(1);

    if (!conversation) return sendError(res, AppError.notFound("Conversation"), req);

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      const { getClientUserAccessibleClients } = await import("../../../middleware/clientAccess");
      const accessibleClients = await getClientUserAccessibleClients(user.id);
      if (!accessibleClients.includes(conversation.clientId)) {
        return sendError(res, AppError.forbidden("Access denied"), req);
      }
    }

    let assigneeName: string | null = null;
    if (conversation.assignedToUserId) {
      const [assignee] = await db.select({ name: users.name })
        .from(users)
        .where(and(eq(users.id, conversation.assignedToUserId), eq(users.tenantId, tenantId)))
        .limit(1);
      assigneeName = assignee?.name || null;
    }

    const isClientUser = user.role === UserRole.CLIENT;

    let messagesQuery = db.select({
      id: clientMessages.id,
      conversationId: clientMessages.conversationId,
      authorUserId: clientMessages.authorUserId,
      bodyText: clientMessages.bodyText,
      bodyRich: clientMessages.bodyRich,
      visibility: clientMessages.visibility,
      createdAt: clientMessages.createdAt,
      authorName: users.name,
      authorRole: users.role,
    })
      .from(clientMessages)
      .leftJoin(users, eq(clientMessages.authorUserId, users.id))
      .where(
        isClientUser
          ? and(eq(clientMessages.conversationId, conversationId), eq(clientMessages.visibility, ClientMessageVisibility.PUBLIC))
          : eq(clientMessages.conversationId, conversationId)
      )
      .orderBy(clientMessages.createdAt);

    const messages = await messagesQuery;

    res.json({ conversation: { ...conversation, assigneeName }, messages });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/conversations/:conversationId/messages", req);
  }
});

router.post("/crm/conversations/:conversationId/messages", requireAuth, clientMessageRateLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { conversationId } = req.params;

    const [conversation] = await db.select()
      .from(clientConversations)
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)))
      .limit(1);

    if (!conversation) return sendError(res, AppError.notFound("Conversation"), req);

    if (conversation.closedAt) {
      return sendError(res, AppError.badRequest("This conversation is closed"), req);
    }

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      const { getClientUserAccessibleClients } = await import("../../../middleware/clientAccess");
      const accessibleClients = await getClientUserAccessibleClients(user.id);
      if (!accessibleClients.includes(conversation.clientId)) {
        return sendError(res, AppError.forbidden("Access denied"), req);
      }
    }

    const schema = z.object({
      bodyText: z.string().min(1),
      bodyRich: z.string().optional(),
      visibility: z.enum(["public", "internal"]).optional().default("public"),
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const userId = getCurrentUserId(req);

    if (data.visibility === "internal" && user.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Client users cannot post internal notes"), req);
    }

    const [message] = await db.insert(clientMessages).values({
      tenantId,
      conversationId,
      authorUserId: userId,
      bodyText: data.bodyText,
      bodyRich: data.bodyRich || null,
      visibility: data.visibility,
    }).returning();

    await db.update(clientConversations)
      .set({ updatedAt: new Date() })
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)));

    if (data.visibility === "internal") {
      emitToTenant(tenantId, CLIENT_CONVERSATION_EVENTS.INTERNAL_NOTE_ADDED, {
        conversationId,
        tenantId,
        clientId: conversation.clientId,
        subject: conversation.subject,
        assignedToUserId: conversation.assignedToUserId,
        authorUserId: userId,
        messageId: message.id,
      });
    } else {
      if (conversation.assignedToUserId && conversation.assignedToUserId !== userId) {
        emitToUser(conversation.assignedToUserId, CLIENT_CONVERSATION_EVENTS.MESSAGE_ADDED, {
          conversationId,
          tenantId,
          clientId: conversation.clientId,
          subject: conversation.subject,
          assignedToUserId: conversation.assignedToUserId,
          authorUserId: userId,
          messageId: message.id,
        });
      }
    }

    res.status(201).json(message);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/conversations/:conversationId/messages", req);
  }
});

router.get("/crm/portal/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Portal access only"), req);
    }

    const { getClientUserAccessibleClients } = await import("../../../middleware/clientAccess");
    const clientIds = await getClientUserAccessibleClients(user.id);

    if (clientIds.length === 0) return res.json([]);

    const results = await db.select({
      conversation: clientConversations,
      creatorName: users.name,
      clientName: clients.companyName,
    })
      .from(clientConversations)
      .leftJoin(users, eq(clientConversations.createdByUserId, users.id))
      .leftJoin(clients, eq(clientConversations.clientId, clients.id))
      .where(
        and(
          eq(clientConversations.tenantId, tenantId),
          inArray(clientConversations.clientId, clientIds)
        )
      )
      .orderBy(desc(clientConversations.updatedAt));

    const convosWithMeta = await Promise.all(results.map(async (r) => {
      const publicOnly = and(
        eq(clientMessages.conversationId, r.conversation.id),
        eq(clientMessages.visibility, ClientMessageVisibility.PUBLIC)
      );

      const [msgCount] = await db.select({ value: count() })
        .from(clientMessages)
        .where(publicOnly);

      const [lastMsg] = await db.select({
        bodyText: clientMessages.bodyText,
        createdAt: clientMessages.createdAt,
        authorName: users.name,
      })
        .from(clientMessages)
        .leftJoin(users, eq(clientMessages.authorUserId, users.id))
        .where(publicOnly)
        .orderBy(desc(clientMessages.createdAt))
        .limit(1);

      return {
        ...r.conversation,
        creatorName: r.creatorName || "Unknown",
        clientName: r.clientName || "Unknown",
        messageCount: msgCount?.value || 0,
        lastMessage: lastMsg || null,
      };
    }));

    res.json(convosWithMeta);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/portal/conversations", req);
  }
});

export default router;
