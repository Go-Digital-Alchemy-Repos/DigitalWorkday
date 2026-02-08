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
} from "@shared/schema";
import { getCurrentUserId } from "../../helpers";
import { verifyClientTenancy } from "./crm.helpers";

const router = Router();

router.get("/crm/clients/:clientId/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const results = await db.select({
      conversation: clientConversations,
      creatorName: users.name,
    })
      .from(clientConversations)
      .leftJoin(users, eq(clientConversations.createdByUserId, users.id))
      .where(and(eq(clientConversations.clientId, clientId), eq(clientConversations.tenantId, tenantId)))
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

      return {
        ...r.conversation,
        creatorName: r.creatorName || "Unknown",
        messageCount: msgCount?.value || 0,
        lastMessage: lastMsg || null,
      };
    }));

    res.json(convosWithMeta);
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
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const userId = getCurrentUserId(req);

    const [conversation] = await db.insert(clientConversations).values({
      tenantId,
      clientId,
      projectId: data.projectId || null,
      subject: data.subject,
      createdByUserId: userId,
    }).returning();

    await db.insert(clientMessages).values({
      tenantId,
      conversationId: conversation.id,
      authorUserId: userId,
      bodyText: data.initialMessage,
    });

    res.status(201).json(conversation);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/conversations", req);
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

    const messages = await db.select({
      id: clientMessages.id,
      conversationId: clientMessages.conversationId,
      authorUserId: clientMessages.authorUserId,
      bodyText: clientMessages.bodyText,
      bodyRich: clientMessages.bodyRich,
      createdAt: clientMessages.createdAt,
      authorName: users.name,
      authorRole: users.role,
    })
      .from(clientMessages)
      .leftJoin(users, eq(clientMessages.authorUserId, users.id))
      .where(eq(clientMessages.conversationId, conversationId))
      .orderBy(clientMessages.createdAt);

    res.json({ conversation, messages });
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
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const userId = getCurrentUserId(req);

    const [message] = await db.insert(clientMessages).values({
      tenantId,
      conversationId,
      authorUserId: userId,
      bodyText: data.bodyText,
      bodyRich: data.bodyRich || null,
    }).returning();

    await db.update(clientConversations)
      .set({ updatedAt: new Date() })
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)));

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
