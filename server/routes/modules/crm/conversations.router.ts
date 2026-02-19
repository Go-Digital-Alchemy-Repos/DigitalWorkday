import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, desc, count, inArray, gte, isNull, ne, sql as dsql, isNotNull, lt, lte, or, ilike, exists } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { requireAuth, requireAdmin } from "../../../auth";
import { clientMessageRateLimiter } from "../../../middleware/rateLimit";
import {
  clientConversations,
  clientMessages,
  clients,
  users,
  UserRole,
  ClientMessageVisibility,
  conversationSlaPolicies,
  ConversationPriority,
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

    const userId = getCurrentUserId(req);
    const assignedFilter = req.query.assigned as string | undefined;
    const search = (req.query.search as string || "").trim();
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const includeMerged = req.query.includeMerged === "true";

    const conditions: any[] = [
      eq(clientConversations.clientId, clientId),
      eq(clientConversations.tenantId, tenantId),
    ];

    if (!includeMerged) conditions.push(isNull(clientConversations.mergedIntoId));

    if (assignedFilter === "me") {
      conditions.push(eq(clientConversations.assignedToUserId, userId));
    } else if (assignedFilter === "unassigned") {
      conditions.push(isNull(clientConversations.assignedToUserId));
    } else if (assignedFilter && assignedFilter !== "all") {
      conditions.push(eq(clientConversations.assignedToUserId, assignedFilter));
    }

    if (status === "open") {
      conditions.push(isNull(clientConversations.closedAt));
    } else if (status === "closed") {
      conditions.push(isNotNull(clientConversations.closedAt));
    }

    if (priority && ["low", "normal", "high", "urgent"].includes(priority)) {
      conditions.push(eq(clientConversations.priority, priority));
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) conditions.push(gte(clientConversations.createdAt, from));
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        conditions.push(lte(clientConversations.createdAt, to));
      }
    }

    if (search) {
      const tsQuery = search.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[^\w]/g, '')).filter(Boolean).join(' & ');
      if (tsQuery) {
        conditions.push(
          or(
            dsql`to_tsvector('english', ${clientConversations.subject}) @@ to_tsquery('english', ${tsQuery})`,
            exists(
              db.select({ val: dsql`1` })
                .from(clientMessages)
                .where(and(
                  eq(clientMessages.conversationId, clientConversations.id),
                  eq(clientMessages.tenantId, tenantId),
                  dsql`to_tsvector('english', ${clientMessages.bodyText}) @@ to_tsquery('english', ${tsQuery})`,
                ))
            ),
            ilike(clientConversations.subject, `%${search}%`),
            exists(
              db.select({ val: dsql`1` })
                .from(clientMessages)
                .where(and(
                  eq(clientMessages.conversationId, clientConversations.id),
                  eq(clientMessages.tenantId, tenantId),
                  ilike(clientMessages.bodyText, `%${search}%`),
                ))
            )
          )
        );
      }
    }

    const results = await db.select({
      conversation: clientConversations,
      creatorName: users.name,
    })
      .from(clientConversations)
      .leftJoin(users, eq(clientConversations.createdByUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(clientConversations.updatedAt));

    const convoIds = results.map(r => r.conversation.id);

    const [msgCounts, lastMsgs, assigneeRows] = await Promise.all([
      convoIds.length > 0
        ? db.select({ conversationId: clientMessages.conversationId, value: count() })
            .from(clientMessages)
            .where(inArray(clientMessages.conversationId, convoIds))
            .groupBy(clientMessages.conversationId)
        : Promise.resolve([]),

      convoIds.length > 0
        ? db.execute(dsql`
            SELECT DISTINCT ON (cm.conversation_id)
              cm.conversation_id,
              cm.body_text,
              cm.created_at,
              u.name as author_name
            FROM client_messages cm
            LEFT JOIN users u ON cm.author_user_id = u.id
            WHERE cm.conversation_id = ANY(${convoIds})
            ORDER BY cm.conversation_id, cm.created_at DESC
          `)
        : Promise.resolve({ rows: [] }),

      convoIds.length > 0
        ? (() => {
            const assigneeUserIds = results
              .map(r => r.conversation.assignedToUserId)
              .filter((id): id is string => !!id);
            if (assigneeUserIds.length === 0) return Promise.resolve([]);
            return db.select({ id: users.id, name: users.name })
              .from(users)
              .where(and(inArray(users.id, assigneeUserIds), eq(users.tenantId, tenantId)));
          })()
        : Promise.resolve([]),
    ]);

    let snippetMap: Record<string, string> = {};
    if (search && convoIds.length > 0) {
      const tsQuery = search.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[^\w]/g, '')).filter(Boolean).join(' & ');
      if (tsQuery) {
        try {
          const snippetResults = await db.execute(dsql`
            SELECT DISTINCT ON (cm.conversation_id)
              cm.conversation_id,
              ts_headline('english', cm.body_text, to_tsquery('english', ${tsQuery}),
                'MaxWords=20, MinWords=10, StartSel=, StopSel=') as snippet
            FROM client_messages cm
            WHERE cm.conversation_id = ANY(${convoIds})
              AND cm.tenant_id = ${tenantId}
              AND to_tsvector('english', cm.body_text) @@ to_tsquery('english', ${tsQuery})
            ORDER BY cm.conversation_id, cm.created_at ASC
          `);
          for (const row of snippetResults.rows as any[]) {
            snippetMap[row.conversation_id] = row.snippet;
          }
        } catch {
          const fallbackResults = await db.execute(dsql`
            SELECT DISTINCT ON (cm.conversation_id)
              cm.conversation_id,
              substring(cm.body_text from 1 for 120) as snippet
            FROM client_messages cm
            WHERE cm.conversation_id = ANY(${convoIds})
              AND cm.tenant_id = ${tenantId}
              AND cm.body_text ILIKE ${'%' + search + '%'}
            ORDER BY cm.conversation_id, cm.created_at ASC
          `);
          for (const row of fallbackResults.rows as any[]) {
            snippetMap[row.conversation_id] = row.snippet;
          }
        }
      }
    }

    const countMap = new Map((msgCounts as any[]).map(r => [r.conversationId, Number(r.value)]));
    const lastMsgMap = new Map((lastMsgs.rows as any[]).map(r => [r.conversation_id, {
      bodyText: r.body_text,
      createdAt: r.created_at,
      authorName: r.author_name,
    }]));
    const assigneeMap = new Map((assigneeRows as any[]).map(r => [r.id, r.name]));

    const convosWithMeta = results.map((r) => ({
      ...r.conversation,
      creatorName: r.creatorName || "Unknown",
      assigneeName: r.conversation.assignedToUserId ? (assigneeMap.get(r.conversation.assignedToUserId) || null) : null,
      messageCount: countMap.get(r.conversation.id) || 0,
      lastMessage: lastMsgMap.get(r.conversation.id) || null,
      ...(snippetMap[r.conversation.id] ? { matchingSnippet: snippetMap[r.conversation.id] } : {}),
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
      assignedToUserId: z.string().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
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
      priority: data.priority,
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

    let slaPolicy = null;
    if (user.role !== UserRole.CLIENT) {
      const [policy] = await db.select()
        .from(conversationSlaPolicies)
        .where(and(
          eq(conversationSlaPolicies.tenantId, tenantId),
          eq(conversationSlaPolicies.priority, conversation.priority),
        ))
        .limit(1);
      slaPolicy = policy || null;
    }

    res.json({ conversation: { ...conversation, assigneeName, slaPolicy }, messages });
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

    const updateFields: Record<string, any> = { updatedAt: new Date() };

    if (data.visibility === "public" && user.role !== UserRole.CLIENT && !conversation.firstResponseAt) {
      updateFields.firstResponseAt = new Date();
    }

    await db.update(clientConversations)
      .set(updateFields)
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

router.post("/crm/conversations/:conversationId/merge", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
      return sendError(res, AppError.forbidden("Only admins can merge conversations"), req);
    }

    const { conversationId } = req.params;
    const schema = z.object({
      targetConversationId: z.string().min(1),
    });
    const data = validateBody(req.body, schema, res);
    if (!data) return;

    if (conversationId === data.targetConversationId) {
      return sendError(res, AppError.badRequest("Cannot merge a conversation with itself"), req);
    }

    const [primary] = await db.select()
      .from(clientConversations)
      .where(and(eq(clientConversations.id, data.targetConversationId), eq(clientConversations.tenantId, tenantId)))
      .limit(1);

    const [secondary] = await db.select()
      .from(clientConversations)
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)))
      .limit(1);

    if (!primary || !secondary) {
      return sendError(res, AppError.notFound("Conversation"), req);
    }

    if (primary.clientId !== secondary.clientId) {
      return sendError(res, AppError.badRequest("Cannot merge conversations from different clients"), req);
    }

    if (primary.mergedIntoId) {
      return sendError(res, AppError.badRequest("Target conversation has already been merged into another thread"), req);
    }

    if (secondary.mergedIntoId) {
      return sendError(res, AppError.badRequest("This conversation has already been merged"), req);
    }

    const userId = getCurrentUserId(req);
    const [actorUser] = await db.select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const actorName = actorUser?.name || "Unknown";
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.update(clientMessages)
        .set({ conversationId: primary.id })
        .where(eq(clientMessages.conversationId, secondary.id));

      await tx.update(clientConversations)
        .set({
          mergedIntoId: primary.id,
          mergedAt: now,
          mergedByUserId: userId,
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(clientConversations.id, secondary.id));

      await tx.insert(clientMessages).values({
        tenantId,
        conversationId: primary.id,
        authorUserId: userId,
        bodyText: `[Thread Merged] "${secondary.subject}" was merged into this conversation by ${actorName}.`,
        visibility: "internal",
      });

      await tx.update(clientConversations)
        .set({ updatedAt: now })
        .where(eq(clientConversations.id, primary.id));
    });

    const [msgCount] = await db.select({ value: count() })
      .from(clientMessages)
      .where(eq(clientMessages.conversationId, primary.id));

    emitToTenant(tenantId, CLIENT_CONVERSATION_EVENTS.MERGED, {
      primaryConversationId: primary.id,
      secondaryConversationId: secondary.id,
      tenantId,
      clientId: primary.clientId,
      mergedByUserId: userId,
    });

    res.json({
      primaryId: primary.id,
      secondaryId: secondary.id,
      messagesMerged: msgCount?.value || 0,
      message: `Conversation "${secondary.subject}" merged into "${primary.subject}"`,
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/conversations/:conversationId/merge", req);
  }
});

router.get("/crm/conversations/:conversationId/duplicates", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Clients cannot check duplicates"), req);
    }

    const { conversationId } = req.params;

    const [conversation] = await db.select()
      .from(clientConversations)
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)))
      .limit(1);

    if (!conversation) return sendError(res, AppError.notFound("Conversation"), req);

    const fiveMinAgo = new Date(conversation.createdAt.getTime() - 5 * 60 * 1000);
    const fiveMinAfter = new Date(conversation.createdAt.getTime() + 5 * 60 * 1000);

    const duplicates = await db.select({
      id: clientConversations.id,
      subject: clientConversations.subject,
      createdAt: clientConversations.createdAt,
      closedAt: clientConversations.closedAt,
      mergedIntoId: clientConversations.mergedIntoId,
    })
      .from(clientConversations)
      .where(
        and(
          eq(clientConversations.tenantId, tenantId),
          eq(clientConversations.clientId, conversation.clientId),
          ne(clientConversations.id, conversationId),
          isNull(clientConversations.mergedIntoId),
          dsql`lower(${clientConversations.subject}) = lower(${conversation.subject})`,
          gte(clientConversations.createdAt, fiveMinAgo),
          dsql`${clientConversations.createdAt} <= ${fiveMinAfter}`
        )
      )
      .orderBy(desc(clientConversations.createdAt));

    res.json(duplicates);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/conversations/:conversationId/duplicates", req);
  }
});

router.get("/crm/clients/:clientId/conversations/merge-candidates", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Clients cannot merge conversations"), req);
    }

    const { clientId } = req.params;
    const excludeId = req.query.exclude as string | undefined;

    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    let condition = and(
      eq(clientConversations.clientId, clientId),
      eq(clientConversations.tenantId, tenantId),
      isNull(clientConversations.mergedIntoId),
      isNull(clientConversations.closedAt),
    );

    const results = await db.select({
      id: clientConversations.id,
      subject: clientConversations.subject,
      status: clientConversations.status,
      createdAt: clientConversations.createdAt,
      updatedAt: clientConversations.updatedAt,
      assignedToUserId: clientConversations.assignedToUserId,
    })
      .from(clientConversations)
      .where(condition)
      .orderBy(desc(clientConversations.updatedAt));

    const filtered = excludeId ? results.filter(r => r.id !== excludeId) : results;

    const withMeta = await Promise.all(filtered.map(async (c) => {
      const [msgCount] = await db.select({ value: count() })
        .from(clientMessages)
        .where(eq(clientMessages.conversationId, c.id));
      const [lastMsg] = await db.select({
        createdAt: clientMessages.createdAt,
      })
        .from(clientMessages)
        .where(eq(clientMessages.conversationId, c.id))
        .orderBy(desc(clientMessages.createdAt))
        .limit(1);
      return { ...c, messageCount: msgCount?.value || 0, lastMessage: lastMsg || null };
    }));

    res.json(withMeta);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/conversations/merge-candidates", req);
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
          inArray(clientConversations.clientId, clientIds),
          isNull(clientConversations.mergedIntoId)
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

// ============================================================
// Conversation SLA Policy CRUD
// ============================================================

router.get("/crm/conversation-sla-policies", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const policies = await db.select()
      .from(conversationSlaPolicies)
      .where(eq(conversationSlaPolicies.tenantId, tenantId))
      .orderBy(conversationSlaPolicies.priority);

    res.json(policies);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/conversation-sla-policies", req);
  }
});

router.post("/crm/conversation-sla-policies", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
      return sendError(res, AppError.forbidden("Only admins can manage SLA policies"), req);
    }

    const schema = z.object({
      priority: z.enum(["low", "normal", "high", "urgent"]),
      firstResponseMinutes: z.number().int().positive(),
      resolutionMinutes: z.number().int().positive(),
      escalationJson: z.record(z.unknown()).optional(),
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const existing = await db.select({ id: conversationSlaPolicies.id })
      .from(conversationSlaPolicies)
      .where(and(eq(conversationSlaPolicies.tenantId, tenantId), eq(conversationSlaPolicies.priority, data.priority)))
      .limit(1);

    if (existing.length > 0) {
      return sendError(res, AppError.badRequest(`SLA policy for priority "${data.priority}" already exists`), req);
    }

    const [policy] = await db.insert(conversationSlaPolicies).values({
      tenantId,
      priority: data.priority,
      firstResponseMinutes: data.firstResponseMinutes,
      resolutionMinutes: data.resolutionMinutes,
      escalationJson: data.escalationJson || {},
    }).returning();

    res.status(201).json(policy);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/conversation-sla-policies", req);
  }
});

router.patch("/crm/conversation-sla-policies/:policyId", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
      return sendError(res, AppError.forbidden("Only admins can manage SLA policies"), req);
    }

    const { policyId } = req.params;
    const schema = z.object({
      firstResponseMinutes: z.number().int().positive().optional(),
      resolutionMinutes: z.number().int().positive().optional(),
      escalationJson: z.record(z.unknown()).optional(),
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const [updated] = await db.update(conversationSlaPolicies)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(conversationSlaPolicies.id, policyId), eq(conversationSlaPolicies.tenantId, tenantId)))
      .returning();

    if (!updated) return sendError(res, AppError.notFound("SLA Policy"), req);
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/conversation-sla-policies/:policyId", req);
  }
});

router.delete("/crm/conversation-sla-policies/:policyId", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
      return sendError(res, AppError.forbidden("Only admins can manage SLA policies"), req);
    }

    const { policyId } = req.params;
    const [deleted] = await db.delete(conversationSlaPolicies)
      .where(and(eq(conversationSlaPolicies.id, policyId), eq(conversationSlaPolicies.tenantId, tenantId)))
      .returning();

    if (!deleted) return sendError(res, AppError.notFound("SLA Policy"), req);
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/conversation-sla-policies/:policyId", req);
  }
});

// ============================================================
// Conversation SLA Evaluator
// ============================================================

export async function evaluateConversationSla(tenantId?: string) {
  const tenantFilter = tenantId
    ? and(isNull(clientConversations.closedAt), isNull(clientConversations.mergedIntoId), eq(clientConversations.tenantId, tenantId))
    : and(isNull(clientConversations.closedAt), isNull(clientConversations.mergedIntoId));

  const openConversations = await db.select()
    .from(clientConversations)
    .where(tenantFilter);

  let firstResponseBreaches = 0;
  let resolutionBreaches = 0;
  const now = new Date();

  for (const convo of openConversations) {
    const [policy] = await db.select()
      .from(conversationSlaPolicies)
      .where(and(
        eq(conversationSlaPolicies.tenantId, convo.tenantId),
        eq(conversationSlaPolicies.priority, convo.priority),
      ))
      .limit(1);

    if (!policy) continue;

    const createdAt = new Date(convo.createdAt);

    if (!convo.firstResponseAt && !convo.firstResponseBreachedAt) {
      const deadlineMs = createdAt.getTime() + policy.firstResponseMinutes * 60_000;
      if (now.getTime() > deadlineMs) {
        await db.update(clientConversations)
          .set({ firstResponseBreachedAt: now })
          .where(eq(clientConversations.id, convo.id));
        firstResponseBreaches++;

        if (convo.assignedToUserId) {
          try {
            const notification = await storage.createNotification({
              tenantId: convo.tenantId,
              userId: convo.assignedToUserId,
              type: "task_assigned",
              title: "SLA Breach: First Response",
              message: `Conversation "${convo.subject}" has breached the first response SLA (${policy.firstResponseMinutes} min)`,
              payloadJson: { conversationId: convo.id, clientId: convo.clientId, slaType: "first_response" } as any,
            });
            emitNotificationNew(convo.assignedToUserId, {
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
      }
    }

    if (!convo.resolutionBreachedAt) {
      const resDeadlineMs = createdAt.getTime() + policy.resolutionMinutes * 60_000;
      if (now.getTime() > resDeadlineMs) {
        await db.update(clientConversations)
          .set({ resolutionBreachedAt: now })
          .where(eq(clientConversations.id, convo.id));
        resolutionBreaches++;

        if (convo.assignedToUserId) {
          try {
            const notification = await storage.createNotification({
              tenantId: convo.tenantId,
              userId: convo.assignedToUserId,
              type: "task_assigned",
              title: "SLA Breach: Resolution Time",
              message: `Conversation "${convo.subject}" has breached the resolution SLA (${policy.resolutionMinutes} min)`,
              payloadJson: { conversationId: convo.id, clientId: convo.clientId, slaType: "resolution" } as any,
            });
            emitNotificationNew(convo.assignedToUserId, {
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
      }
    }
  }

  return { checked: openConversations.length, firstResponseBreaches, resolutionBreaches };
}

// Manual trigger for SLA evaluation
router.post("/crm/conversation-sla-evaluate", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);
    const results = await evaluateConversationSla(tenantId);
    res.json(results);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/conversation-sla-evaluate", req);
  }
});

// Update priority on a conversation
router.patch("/crm/conversations/:conversationId/priority", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Clients cannot change priority"), req);
    }

    const { conversationId } = req.params;
    const schema = z.object({
      priority: z.enum(["low", "normal", "high", "urgent"]),
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const [updated] = await db.update(clientConversations)
      .set({ priority: data.priority, updatedAt: new Date() })
      .where(and(eq(clientConversations.id, conversationId), eq(clientConversations.tenantId, tenantId)))
      .returning();

    if (!updated) return sendError(res, AppError.notFound("Conversation"), req);
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/conversations/:conversationId/priority", req);
  }
});

// =============================================================================
// MESSAGES REPORTING DASHBOARD
// =============================================================================

router.get("/crm/messages/reports", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const daysBack = Math.min(parseInt(req.query.days as string) || 30, 365);
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const baseConditions = [
      eq(clientConversations.tenantId, tenantId),
      isNull(clientConversations.mergedIntoId),
    ];
    const periodConditions = [
      ...baseConditions,
      gte(clientConversations.createdAt, since),
    ];

    const [
      avgResponseResult,
      avgResolutionResult,
      openByPriorityResult,
      overdueResult,
      volumeByClientResult,
      dailyTrendResult,
      totalCountResult,
      openCountResult,
      closedCountResult,
    ] = await Promise.all([
      db.execute(dsql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) as avg_first_response_seconds,
          COUNT(*) as responded_count
        FROM client_conversations
        WHERE tenant_id = ${tenantId}
          AND merged_into_id IS NULL
          AND first_response_at IS NOT NULL
          AND created_at >= ${since}
      `),

      db.execute(dsql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (closed_at - created_at))) as avg_resolution_seconds,
          COUNT(*) as resolved_count
        FROM client_conversations
        WHERE tenant_id = ${tenantId}
          AND merged_into_id IS NULL
          AND closed_at IS NOT NULL
          AND created_at >= ${since}
      `),

      db.select({
        priority: clientConversations.priority,
        count: count(),
      })
        .from(clientConversations)
        .where(and(
          ...baseConditions,
          isNull(clientConversations.closedAt),
        ))
        .groupBy(clientConversations.priority),

      db.select({ count: count() })
        .from(clientConversations)
        .where(and(
          ...baseConditions,
          isNull(clientConversations.closedAt),
          or(
            isNotNull(clientConversations.firstResponseBreachedAt),
            isNotNull(clientConversations.resolutionBreachedAt),
          ),
        )),

      db.execute(dsql`
        SELECT
          c.id as client_id,
          c.name as client_name,
          COUNT(cc.id) as conversation_count,
          COUNT(CASE WHEN cc.closed_at IS NULL THEN 1 END) as open_count,
          COUNT(CASE WHEN cc.closed_at IS NOT NULL THEN 1 END) as closed_count
        FROM clients c
        LEFT JOIN client_conversations cc ON cc.client_id = c.id
          AND cc.tenant_id = ${tenantId}
          AND cc.merged_into_id IS NULL
          AND cc.created_at >= ${since}
        WHERE c.tenant_id = ${tenantId}
        GROUP BY c.id, c.name
        HAVING COUNT(cc.id) > 0
        ORDER BY conversation_count DESC
        LIMIT 20
      `),

      db.execute(dsql`
        SELECT
          to_char(date_trunc('day', cc.created_at), 'YYYY-MM-DD') as day,
          COUNT(*) as created_count,
          COUNT(CASE WHEN cc.first_response_at IS NOT NULL THEN 1 END) as responded_count,
          AVG(CASE WHEN cc.first_response_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (cc.first_response_at - cc.created_at))
            ELSE NULL END) as avg_response_seconds,
          COUNT(CASE WHEN cc.closed_at IS NOT NULL THEN 1 END) as resolved_count
        FROM client_conversations cc
        WHERE cc.tenant_id = ${tenantId}
          AND cc.merged_into_id IS NULL
          AND cc.created_at >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `),

      db.select({ count: count() })
        .from(clientConversations)
        .where(and(...periodConditions)),

      db.select({ count: count() })
        .from(clientConversations)
        .where(and(...periodConditions, isNull(clientConversations.closedAt))),

      db.select({ count: count() })
        .from(clientConversations)
        .where(and(...periodConditions, isNotNull(clientConversations.closedAt))),
    ]);

    const avgRow = avgResponseResult.rows[0] as any;
    const resRow = avgResolutionResult.rows[0] as any;

    const avgFirstResponseMinutes = avgRow?.avg_first_response_seconds
      ? Math.round(Number(avgRow.avg_first_response_seconds) / 60)
      : null;
    const avgResolutionMinutes = resRow?.avg_resolution_seconds
      ? Math.round(Number(resRow.avg_resolution_seconds) / 60)
      : null;

    const openByPriority = Object.fromEntries(
      ["low", "normal", "high", "urgent"].map(p => [
        p,
        openByPriorityResult.find(r => r.priority === p)?.count || 0,
      ])
    );

    const overdueCount = overdueResult[0]?.count || 0;

    const volumeByClient = (volumeByClientResult.rows as any[]).map(r => ({
      clientId: r.client_id,
      clientName: r.client_name,
      total: Number(r.conversation_count),
      open: Number(r.open_count),
      closed: Number(r.closed_count),
    }));

    const dailyTrend = (dailyTrendResult.rows as any[]).map(r => ({
      date: r.day,
      created: Number(r.created_count),
      responded: Number(r.responded_count),
      resolved: Number(r.resolved_count),
      avgResponseMinutes: r.avg_response_seconds
        ? Math.round(Number(r.avg_response_seconds) / 60)
        : null,
    }));

    res.json({
      period: { days: daysBack, since: since.toISOString() },
      summary: {
        total: totalCountResult[0]?.count || 0,
        open: openCountResult[0]?.count || 0,
        closed: closedCountResult[0]?.count || 0,
        overdue: overdueCount,
        avgFirstResponseMinutes,
        avgResolutionMinutes,
        respondedCount: Number(avgRow?.responded_count || 0),
        resolvedCount: Number(resRow?.resolved_count || 0),
      },
      openByPriority,
      volumeByClient,
      dailyTrend,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/messages/reports", req);
  }
});

export default router;
