import { z } from "zod";
import { createApiRouter } from "../routerFactory";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { AppError, handleRouteError } from "../../lib/errors";
import { SupportTicketStatus, SupportTicketPriority, SupportTicketCategory, SupportTicketAuthorType, SupportTicketEventType, SupportTicketSource } from "@shared/schema";

const router = createApiRouter({ policy: "authTenant" });

const createTicketSchema = z.object({
  clientId: z.string().optional().nullable(),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  category: z.enum(["support", "work_order", "billing", "bug", "feature_request"]).optional().default("support"),
  assignedToUserId: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

const updateTicketSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["open", "in_progress", "waiting_on_client", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z.enum(["support", "work_order", "billing", "bug", "feature_request"]).optional(),
  assignedToUserId: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

const addMessageSchema = z.object({
  bodyText: z.string().min(1),
  visibility: z.enum(["public", "internal"]).optional().default("public"),
});

router.get("/tickets", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { status, priority, category, search, clientId, assignedToUserId, limit, offset } = req.query;
    const result = await storage.getSupportTicketsByTenant(tenantId, {
      status: status as string | undefined,
      priority: priority as string | undefined,
      category: category as string | undefined,
      search: search as string | undefined,
      clientId: clientId as string | undefined,
      assignedToUserId: assignedToUserId as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    const enrichedTickets = await Promise.all(
      result.tickets.map(async (t) => {
        const [client, assignee] = await Promise.all([
          t.clientId ? storage.getClient(t.clientId) : null,
          t.assignedToUserId ? storage.getUser(t.assignedToUserId) : null,
        ]);
        return {
          ...t,
          client: client ? { id: client.id, companyName: client.companyName } : null,
          assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
        };
      })
    );

    res.json({ tickets: enrichedTickets, total: result.total });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/tickets", req);
  }
});

router.get("/tickets/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw AppError.notFound("Support ticket");
    }

    const [messages, events, createdByUser, createdByPortalUser, assignee, client] = await Promise.all([
      storage.getSupportTicketMessages(ticket.id, tenantId, true),
      storage.getSupportTicketEvents(ticket.id, tenantId),
      ticket.createdByUserId ? storage.getUser(ticket.createdByUserId) : null,
      ticket.createdByPortalUserId ? storage.getUser(ticket.createdByPortalUserId) : null,
      ticket.assignedToUserId ? storage.getUser(ticket.assignedToUserId) : null,
      ticket.clientId ? storage.getClient(ticket.clientId) : null,
    ]);

    const messagesWithAuthors = await Promise.all(
      messages.map(async (m) => {
        const author = m.authorUserId ? await storage.getUser(m.authorUserId) : m.authorPortalUserId ? await storage.getUser(m.authorPortalUserId) : null;
        return { ...m, author: author ? { id: author.id, name: author.name, email: author.email } : null };
      })
    );

    const eventsWithActors = await Promise.all(
      events.map(async (e) => {
        const actor = e.actorUserId ? await storage.getUser(e.actorUserId) : null;
        return { ...e, actor: actor ? { id: actor.id, name: actor.name, email: actor.email } : null };
      })
    );

    res.json({
      ...ticket,
      createdByUser: createdByUser ? { id: createdByUser.id, name: createdByUser.name, email: createdByUser.email } : null,
      createdByPortalUser: createdByPortalUser ? { id: createdByPortalUser.id, name: createdByPortalUser.name, email: createdByPortalUser.email } : null,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
      client: client ? { id: client.id, companyName: client.companyName } : null,
      messages: messagesWithAuthors,
      events: eventsWithActors,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/tickets/:id", req);
  }
});

router.post("/tickets", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const body = createTicketSchema.parse(req.body);
    const userId = req.user!.id;

    const ticket = await storage.createSupportTicket({
      tenantId,
      clientId: body.clientId || null,
      createdByUserId: userId,
      createdByPortalUserId: null,
      title: body.title,
      description: body.description || null,
      priority: body.priority,
      category: body.category,
      source: SupportTicketSource.TENANT,
      assignedToUserId: body.assignedToUserId || null,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
    });

    await storage.createSupportTicketEvent({
      tenantId,
      ticketId: ticket.id,
      actorType: SupportTicketAuthorType.TENANT_USER,
      actorUserId: userId,
      eventType: SupportTicketEventType.CREATED,
      payloadJson: { title: ticket.title },
    });

    res.status(201).json(ticket);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/tickets", req);
  }
});

router.patch("/tickets/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const existing = await storage.getSupportTicket(req.params.id);
    if (!existing || existing.tenantId !== tenantId) {
      throw AppError.notFound("Support ticket");
    }

    const body = updateTicketSchema.parse(req.body);
    const userId = req.user!.id;
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.category !== undefined) updates.category = body.category;
    if (body.assignedToUserId !== undefined) updates.assignedToUserId = body.assignedToUserId;
    if (body.dueAt !== undefined) updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;

    if (body.status !== undefined && body.status !== existing.status) {
      updates.status = body.status;
      if (body.status === SupportTicketStatus.RESOLVED) updates.resolvedAt = new Date();
      if (body.status === SupportTicketStatus.CLOSED) updates.closedAt = new Date();

      await storage.createSupportTicketEvent({
        tenantId,
        ticketId: existing.id,
        actorType: SupportTicketAuthorType.TENANT_USER,
        actorUserId: userId,
        eventType: SupportTicketEventType.STATUS_CHANGED,
        payloadJson: { from: existing.status, to: body.status },
      });
    }

    if (body.assignedToUserId !== undefined && body.assignedToUserId !== existing.assignedToUserId) {
      await storage.createSupportTicketEvent({
        tenantId,
        ticketId: existing.id,
        actorType: SupportTicketAuthorType.TENANT_USER,
        actorUserId: userId,
        eventType: SupportTicketEventType.ASSIGNED,
        payloadJson: { from: existing.assignedToUserId, to: body.assignedToUserId },
      });
    }

    const updated = await storage.updateSupportTicket(existing.id, tenantId, updates as any);
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/v1/support/tickets/:id", req);
  }
});

router.get("/tickets/:id/messages", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw AppError.notFound("Support ticket");
    }

    const messages = await storage.getSupportTicketMessages(ticket.id, tenantId, true);
    const messagesWithAuthors = await Promise.all(
      messages.map(async (m) => {
        const author = m.authorUserId ? await storage.getUser(m.authorUserId) : m.authorPortalUserId ? await storage.getUser(m.authorPortalUserId) : null;
        return { ...m, author: author ? { id: author.id, name: author.name, email: author.email } : null };
      })
    );
    res.json(messagesWithAuthors);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/tickets/:id/messages", req);
  }
});

router.post("/tickets/:id/messages", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw AppError.notFound("Support ticket");
    }

    const body = addMessageSchema.parse(req.body);
    const userId = req.user!.id;

    const message = await storage.createSupportTicketMessage({
      tenantId,
      ticketId: ticket.id,
      authorType: SupportTicketAuthorType.TENANT_USER,
      authorUserId: userId,
      authorPortalUserId: null,
      bodyText: body.bodyText,
      visibility: body.visibility,
    });

    res.status(201).json(message);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/tickets/:id/messages", req);
  }
});

export default router;
