import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { requireAuth, requireAdmin } from "../../../auth";
import {
  clientMessageTemplates,
  clientConversations,
  clientMessages,
  tenantSettings,
  users,
  ConversationType,
  SupportTicketAuthorType,
  SupportTicketCategory,
  SupportTicketEventType,
  SupportTicketMessageVisibility,
  SupportTicketPriority,
  SupportTicketSource,
  UserRole,
  type Notification,
} from "@shared/schema";
import { getCurrentUserId } from "../../helpers";
import { emitToTenant, emitToUser } from "../../../realtime/socket";
import { emitNotificationNew } from "../../../realtime/events";
import { storage } from "../../../storage";
import { CLIENT_CONVERSATION_EVENTS } from "@shared/events";
import type { NotificationPayload } from "@shared/events";
import { getClientPortalContext } from "../../../utils/clientPortalContext";

const router = Router();

function toNotificationPayload(notification: Notification): NotificationPayload {
  return {
    id: notification.id,
    tenantId: notification.tenantId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    payloadJson: notification.payloadJson,
    severity: notification.severity,
    entityType: notification.entityType,
    entityId: notification.entityId,
    href: notification.href,
    isDismissed: notification.isDismissed,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

async function getPortalTenantId(req: Request): Promise<string | null> {
  const user = req.user;
  if (!user) return null;

  if (user.role === UserRole.CLIENT) {
    const { tenantId } = await getClientPortalContext(req);
    return tenantId;
  }

  return getEffectiveTenantId(req);
}

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  bodyText: z.string().max(5000).default(""),
  category: z.string().max(50).default("general"),
  defaultMetadata: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  bodyText: z.string().max(5000).optional(),
  category: z.string().max(50).optional(),
  defaultMetadata: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.get("/crm/message-templates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const templates = await db.select()
      .from(clientMessageTemplates)
      .where(eq(clientMessageTemplates.tenantId, tenantId))
      .orderBy(asc(clientMessageTemplates.sortOrder), asc(clientMessageTemplates.name));

    res.json(templates);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/message-templates", req);
  }
});

router.post("/crm/message-templates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const data = validateBody(req.body, createTemplateSchema, res);
    if (!data) return;

    const [template] = await db.insert(clientMessageTemplates).values({
      tenantId,
      name: data.name,
      subject: data.subject,
      bodyText: data.bodyText,
      category: data.category,
      defaultMetadata: data.defaultMetadata || null,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    }).returning();

    res.status(201).json(template);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/message-templates", req);
  }
});

router.patch("/crm/message-templates/:templateId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { templateId } = req.params;

    const [existing] = await db.select()
      .from(clientMessageTemplates)
      .where(and(eq(clientMessageTemplates.id, templateId), eq(clientMessageTemplates.tenantId, tenantId)))
      .limit(1);

    if (!existing) return sendError(res, AppError.notFound("Template"), req);

    const data = validateBody(req.body, updateTemplateSchema, res);
    if (!data) return;

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.subject !== undefined) updateValues.subject = data.subject;
    if (data.bodyText !== undefined) updateValues.bodyText = data.bodyText;
    if (data.category !== undefined) updateValues.category = data.category;
    if (data.defaultMetadata !== undefined) updateValues.defaultMetadata = data.defaultMetadata;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;
    if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;

    const [updated] = await db.update(clientMessageTemplates)
      .set(updateValues)
      .where(and(eq(clientMessageTemplates.id, templateId), eq(clientMessageTemplates.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/message-templates/:templateId", req);
  }
});

router.delete("/crm/message-templates/:templateId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { templateId } = req.params;

    const [existing] = await db.select()
      .from(clientMessageTemplates)
      .where(and(eq(clientMessageTemplates.id, templateId), eq(clientMessageTemplates.tenantId, tenantId)))
      .limit(1);

    if (!existing) return sendError(res, AppError.notFound("Template"), req);

    await db.delete(clientMessageTemplates)
      .where(and(eq(clientMessageTemplates.id, templateId), eq(clientMessageTemplates.tenantId, tenantId)));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/message-templates/:templateId", req);
  }
});

router.get("/crm/portal/message-templates", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = await getPortalTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Portal access only"), req);
    }

    const templates = await db.select({
      id: clientMessageTemplates.id,
      name: clientMessageTemplates.name,
      subject: clientMessageTemplates.subject,
      bodyText: clientMessageTemplates.bodyText,
      category: clientMessageTemplates.category,
      defaultMetadata: clientMessageTemplates.defaultMetadata,
    })
      .from(clientMessageTemplates)
      .where(and(
        eq(clientMessageTemplates.tenantId, tenantId),
        eq(clientMessageTemplates.isActive, true)
      ))
      .orderBy(asc(clientMessageTemplates.sortOrder), asc(clientMessageTemplates.name));

    res.json(templates);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/portal/message-templates", req);
  }
});

router.get("/crm/portal/conversation-recipients", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = await getPortalTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Portal access only"), req);
    }

    const recipients = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        inArray(users.role, [UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
      ))
      .orderBy(asc(users.name), asc(users.email));

    res.json(recipients);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/portal/conversation-recipients", req);
  }
});

router.post("/crm/portal/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = await getPortalTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Portal access only"), req);
    }

    const schema = z.object({
      clientId: z.string().uuid().optional().nullable(),
      subject: z.string().min(1).max(500),
      initialMessage: z.string().min(1).max(5000),
      bodyRich: z.string().max(15000).optional(),
      type: z.enum([
        ConversationType.EVERYDAY,
        ConversationType.SERVICE_REQUEST,
        ConversationType.SUPPORT_TICKET,
      ]).default(ConversationType.EVERYDAY),
      recipientUserId: z.string().uuid().optional(),
      priority: z.enum([
        SupportTicketPriority.LOW,
        SupportTicketPriority.NORMAL,
        SupportTicketPriority.HIGH,
        SupportTicketPriority.URGENT,
      ]).optional().default(SupportTicketPriority.NORMAL),
      templateId: z.string().uuid().optional(),
    });

    const data = validateBody(req.body, schema, res);
    if (!data) return;

    const { clientIds } = await getClientPortalContext(req);
    const selectedClientId = data.clientId || (clientIds.length === 1 ? clientIds[0] : null);

    if (!selectedClientId) {
      return sendError(
        res,
        AppError.badRequest(
          clientIds.length > 1
            ? "Please select a client account before starting this message"
            : "You do not have access to a client account"
        ),
        req
      );
    }

    if (!clientIds.includes(selectedClientId)) {
      return sendError(res, AppError.forbidden("You do not have access to this client"), req);
    }

    const userId = getCurrentUserId(req);

    if (data.type === ConversationType.SUPPORT_TICKET) {
      const ticket = await storage.createSupportTicket({
        tenantId,
        clientId: selectedClientId,
        createdByUserId: null,
        createdByPortalUserId: userId,
        title: data.subject,
        description: null,
        priority: data.priority,
        category: SupportTicketCategory.SUPPORT,
        source: SupportTicketSource.PORTAL,
        assignedToUserId: null,
        metadataJson: {
          createdFrom: "portal_messages",
          templateId: data.templateId || null,
        },
      });

      await storage.createSupportTicketMessage({
        tenantId,
        ticketId: ticket.id,
        authorUserId: null,
        authorPortalUserId: userId,
        authorType: SupportTicketAuthorType.PORTAL_USER,
        bodyText: data.initialMessage,
        visibility: SupportTicketMessageVisibility.PUBLIC,
      });

      await storage.createSupportTicketEvent({
        tenantId,
        ticketId: ticket.id,
        actorType: SupportTicketAuthorType.PORTAL_USER,
        actorPortalUserId: userId,
        eventType: SupportTicketEventType.CREATED,
        payloadJson: { title: ticket.title },
      });

      return res.status(201).json({
        id: ticket.id,
        kind: "support_ticket",
        ticket,
      });
    }

    let autoAssigneeId: string | null = null;
    if (data.type === ConversationType.EVERYDAY) {
      if (!data.recipientUserId) {
        return sendError(res, AppError.badRequest("Conversation recipient is required"), req);
      }

      const [recipient] = await db.select({ id: users.id, role: users.role, tenantId: users.tenantId, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, data.recipientUserId))
        .limit(1);
      if (!recipient || recipient.tenantId !== tenantId || !recipient.isActive) {
        return sendError(res, AppError.badRequest("Invalid recipient"), req);
      }
      if (![UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(recipient.role as any)) {
        return sendError(res, AppError.badRequest("Conversations can only be sent to admins or project managers"), req);
      }
      autoAssigneeId = data.recipientUserId;
    } else if (data.type === ConversationType.SERVICE_REQUEST) {
      autoAssigneeId = null;
    } else {
      const [settings] = await db.select({ defaultConversationAssigneeId: tenantSettings.defaultConversationAssigneeId })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1);
      if (settings?.defaultConversationAssigneeId) {
        autoAssigneeId = settings.defaultConversationAssigneeId;
      }
    }

    const [conversation] = await db.insert(clientConversations).values({
      tenantId,
      clientId: selectedClientId,
      subject: data.subject,
      type: data.type,
      priority: data.priority,
      createdByUserId: userId,
      assignedToUserId: autoAssigneeId,
    }).returning();

    const [msg] = await db.insert(clientMessages).values({
      tenantId,
      conversationId: conversation.id,
      authorUserId: userId,
      bodyText: data.initialMessage,
      bodyRich: data.bodyRich || null,
    }).returning();

    emitToTenant(tenantId, CLIENT_CONVERSATION_EVENTS.MESSAGE_ADDED, {
      conversationId: conversation.id,
      tenantId,
      clientId: selectedClientId,
      subject: conversation.subject,
      assignedToUserId: autoAssigneeId,
      authorUserId: userId,
      messageId: msg.id,
    });

    if (autoAssigneeId) {
      try {
        const notification = await storage.createNotification({
          tenantId,
          userId: autoAssigneeId,
          type: "task_assigned",
          title: "New client conversation assigned",
          message: `A new conversation "${conversation.subject}" has been auto-assigned to you`,
          payloadJson: { conversationId: conversation.id, clientId: selectedClientId } as any,
          entityType: "client_thread",
          entityId: conversation.id,
          href: `/clients/${selectedClientId}?tab=messages&conversation=${conversation.id}`,
        });
        emitNotificationNew(autoAssigneeId, toNotificationPayload(notification));
      } catch {}

      emitToUser(autoAssigneeId, CLIENT_CONVERSATION_EVENTS.ASSIGNED, {
        conversationId: conversation.id,
        tenantId,
        clientId: selectedClientId,
        subject: conversation.subject,
        assignedToUserId: autoAssigneeId,
        assignedByUserId: null,
      });
    }

    res.status(201).json({ ...conversation, kind: "conversation" });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/portal/conversations", req);
  }
});

export default router;
