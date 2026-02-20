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
  metadataJson: z.record(z.any()).optional().nullable(),
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

    const clientIds = [...new Set(result.tickets.map(t => t.clientId).filter(Boolean))] as string[];
    const userIds = [...new Set(result.tickets.map(t => t.assignedToUserId).filter(Boolean))] as string[];

    const [clientsList, usersList] = await Promise.all([
      clientIds.length > 0 ? storage.getClientsByIds(clientIds) : [],
      userIds.length > 0 ? storage.getUsersByIds(userIds) : [],
    ]);

    const clientsMap = new Map(clientsList.map(c => [c.id, c]));
    const usersMap = new Map(usersList.map(u => [u.id, u]));

    const enrichedTickets = result.tickets.map((t) => {
      const client = t.clientId ? clientsMap.get(t.clientId) : null;
      const assignee = t.assignedToUserId ? usersMap.get(t.assignedToUserId) : null;
      return {
        ...t,
        client: client ? { id: client.id, companyName: client.companyName } : null,
        assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
      };
    });

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

    const allUserIds = new Set<string>();
    messages.forEach(m => { if (m.authorUserId) allUserIds.add(m.authorUserId); if (m.authorPortalUserId) allUserIds.add(m.authorPortalUserId); });
    events.forEach(e => { if (e.actorUserId) allUserIds.add(e.actorUserId); });
    const allUsers = allUserIds.size > 0 ? await storage.getUsersByIds([...allUserIds]) : [];
    const allUsersMap = new Map(allUsers.map(u => [u.id, u]));

    const messagesWithAuthors = messages.map((m) => {
      const authorId = m.authorUserId || m.authorPortalUserId;
      const author = authorId ? allUsersMap.get(authorId) : null;
      return { ...m, author: author ? { id: author.id, name: author.name, email: author.email } : null };
    });

    const eventsWithActors = events.map((e) => {
      const actor = e.actorUserId ? allUsersMap.get(e.actorUserId) : null;
      return { ...e, actor: actor ? { id: actor.id, name: actor.name, email: actor.email } : null };
    });

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

    if (body.metadataJson && body.category) {
      const formSchema = await storage.getTicketFormSchema(tenantId, body.category);
      if (formSchema) {
        const fields = (formSchema.schemaJson as any)?.fields || [];
        for (const field of fields) {
          if (field.required && (body.metadataJson[field.name] === undefined || body.metadataJson[field.name] === null || body.metadataJson[field.name] === "")) {
            throw AppError.badRequest(`Field "${field.label || field.name}" is required`);
          }
        }
      }
    }

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
      metadataJson: body.metadataJson ?? null,
    });

    await storage.createSupportTicketEvent({
      tenantId,
      ticketId: ticket.id,
      actorType: SupportTicketAuthorType.TENANT_USER,
      actorUserId: userId,
      eventType: SupportTicketEventType.CREATED,
      payloadJson: { title: ticket.title },
    });

    if (ticket.assignedToUserId && ticket.assignedToUserId !== userId) {
      (async () => {
        try {
          const { notifySupportTicketAssigned } = await import("../../features/notifications/notification.service");
          const creator = await storage.getUser(userId);
          const assignerName = creator?.name || "Someone";
          await notifySupportTicketAssigned(
            ticket.assignedToUserId!,
            ticket.id,
            ticket.title,
            assignerName,
            { tenantId }
          );
        } catch (e) {
          console.warn("[support] Failed to emit ticket assignment notification:", e);
        }
      })();
    }

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

      if (body.assignedToUserId && body.assignedToUserId !== userId) {
        (async () => {
          try {
            const { notifySupportTicketAssigned } = await import("../../features/notifications/notification.service");
            const assigner = await storage.getUser(userId);
            await notifySupportTicketAssigned(
              body.assignedToUserId!,
              existing.id,
              existing.title,
              assigner?.name || "Someone",
              { tenantId }
            );
          } catch (e) {
            console.warn("[support] Failed to emit ticket reassignment notification:", e);
          }
        })();
      }
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
    const authorIds = new Set<string>();
    messages.forEach(m => { if (m.authorUserId) authorIds.add(m.authorUserId); if (m.authorPortalUserId) authorIds.add(m.authorPortalUserId); });
    const authors = authorIds.size > 0 ? await storage.getUsersByIds([...authorIds]) : [];
    const authorsMap = new Map(authors.map(u => [u.id, u]));

    const messagesWithAuthors = messages.map((m) => {
      const authorId = m.authorUserId || m.authorPortalUserId;
      const author = authorId ? authorsMap.get(authorId) : null;
      return { ...m, author: author ? { id: author.id, name: author.name, email: author.email } : null };
    });
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

    if (body.visibility === "public" && !ticket.firstResponseAt) {
      await storage.setTicketFirstResponse(ticket.id, tenantId, new Date());
    }

    res.status(201).json(message);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/tickets/:id/messages", req);
  }
});

// ============================================================
// Canned Replies CRUD
// ============================================================

const cannedReplySchema = z.object({
  title: z.string().min(1).max(200),
  bodyText: z.string().min(1),
  visibility: z.enum(["public", "internal"]).optional().default("public"),
  workspaceId: z.string().optional().nullable(),
});

router.get("/canned-replies", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const { workspaceId } = req.query;
    const replies = await storage.getSupportCannedReplies(tenantId, workspaceId as string | undefined);
    res.json(replies);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/canned-replies", req);
  }
});

router.post("/canned-replies", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const body = cannedReplySchema.parse(req.body);
    const reply = await storage.createSupportCannedReply({
      tenantId,
      title: body.title,
      bodyText: body.bodyText,
      visibility: body.visibility,
      workspaceId: body.workspaceId || null,
      createdByUserId: req.user!.id,
    });
    res.status(201).json(reply);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/canned-replies", req);
  }
});

router.patch("/canned-replies/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const existing = await storage.getSupportCannedReply(req.params.id, tenantId);
    if (!existing) throw AppError.notFound("Canned reply");
    const body = cannedReplySchema.partial().parse(req.body);
    const updated = await storage.updateSupportCannedReply(req.params.id, tenantId, body as any);
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/v1/support/canned-replies/:id", req);
  }
});

router.delete("/canned-replies/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const deleted = await storage.deleteSupportCannedReply(req.params.id, tenantId);
    if (!deleted) throw AppError.notFound("Canned reply");
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/support/canned-replies/:id", req);
  }
});

// ============================================================
// Macros CRUD
// ============================================================

const macroSchema = z.object({
  title: z.string().min(1).max(200),
  bodyText: z.string().min(1),
  visibility: z.enum(["public", "internal"]).optional().default("public"),
  workspaceId: z.string().optional().nullable(),
  actionsJson: z.object({
    setStatus: z.enum(["open", "in_progress", "waiting_on_client", "resolved", "closed"]).optional(),
    setPriority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assignToUserId: z.string().optional().nullable(),
  }).optional().default({}),
});

router.get("/macros", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const { workspaceId } = req.query;
    const macros = await storage.getSupportMacros(tenantId, workspaceId as string | undefined);
    res.json(macros);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/macros", req);
  }
});

router.post("/macros", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const body = macroSchema.parse(req.body);
    const macro = await storage.createSupportMacro({
      tenantId,
      title: body.title,
      bodyText: body.bodyText,
      visibility: body.visibility,
      workspaceId: body.workspaceId || null,
      actionsJson: body.actionsJson,
      createdByUserId: req.user!.id,
    });
    res.status(201).json(macro);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/macros", req);
  }
});

router.patch("/macros/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const existing = await storage.getSupportMacro(req.params.id, tenantId);
    if (!existing) throw AppError.notFound("Macro");
    const body = macroSchema.partial().parse(req.body);
    const updated = await storage.updateSupportMacro(req.params.id, tenantId, body as any);
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/v1/support/macros/:id", req);
  }
});

router.delete("/macros/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const deleted = await storage.deleteSupportMacro(req.params.id, tenantId);
    if (!deleted) throw AppError.notFound("Macro");
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/support/macros/:id", req);
  }
});

// ============================================================
// Apply Macro to Ticket
// ============================================================

const applyMacroSchema = z.object({
  macroId: z.string().min(1),
  mode: z.enum(["public", "internal"]).optional().default("public"),
});

router.post("/tickets/:ticketId/apply-macro", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const userId = req.user!.id;

    const ticket = await storage.getSupportTicket(req.params.ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw AppError.notFound("Support ticket");
    }

    const body = applyMacroSchema.parse(req.body);
    const macro = await storage.getSupportMacro(body.macroId, tenantId);
    if (!macro) throw AppError.notFound("Macro");

    const actions = (macro.actionsJson || {}) as Record<string, unknown>;
    const appliedActions: string[] = [];

    const message = await storage.createSupportTicketMessage({
      tenantId,
      ticketId: ticket.id,
      authorType: SupportTicketAuthorType.TENANT_USER,
      authorUserId: userId,
      authorPortalUserId: null,
      bodyText: macro.bodyText,
      visibility: body.mode,
    });
    appliedActions.push("message_sent");

    const ticketUpdates: Record<string, unknown> = {};

    if (actions.setStatus && actions.setStatus !== ticket.status) {
      ticketUpdates.status = actions.setStatus;
      if (actions.setStatus === SupportTicketStatus.RESOLVED) ticketUpdates.resolvedAt = new Date();
      if (actions.setStatus === SupportTicketStatus.CLOSED) ticketUpdates.closedAt = new Date();

      await storage.createSupportTicketEvent({
        tenantId,
        ticketId: ticket.id,
        actorType: SupportTicketAuthorType.TENANT_USER,
        actorUserId: userId,
        eventType: SupportTicketEventType.STATUS_CHANGED,
        payloadJson: { from: ticket.status, to: actions.setStatus, macroId: macro.id, macroTitle: macro.title },
      });
      appliedActions.push("status_changed");
    }

    if (actions.setPriority && actions.setPriority !== ticket.priority) {
      ticketUpdates.priority = actions.setPriority;
      await storage.createSupportTicketEvent({
        tenantId,
        ticketId: ticket.id,
        actorType: SupportTicketAuthorType.TENANT_USER,
        actorUserId: userId,
        eventType: SupportTicketEventType.PRIORITY_CHANGED,
        payloadJson: { from: ticket.priority, to: actions.setPriority, macroId: macro.id, macroTitle: macro.title },
      });
      appliedActions.push("priority_changed");
    }

    if (actions.assignToUserId !== undefined && actions.assignToUserId !== ticket.assignedToUserId) {
      ticketUpdates.assignedToUserId = actions.assignToUserId || null;
      await storage.createSupportTicketEvent({
        tenantId,
        ticketId: ticket.id,
        actorType: SupportTicketAuthorType.TENANT_USER,
        actorUserId: userId,
        eventType: SupportTicketEventType.ASSIGNED,
        payloadJson: { from: ticket.assignedToUserId, to: actions.assignToUserId, macroId: macro.id, macroTitle: macro.title },
      });
      appliedActions.push("assigned");
    }

    if (Object.keys(ticketUpdates).length > 0) {
      await storage.updateSupportTicket(ticket.id, tenantId, ticketUpdates as any);
    }

    await storage.createSupportTicketEvent({
      tenantId,
      ticketId: ticket.id,
      actorType: SupportTicketAuthorType.TENANT_USER,
      actorUserId: userId,
      eventType: "macro_applied",
      payloadJson: { macroId: macro.id, macroTitle: macro.title, actions: appliedActions },
    });

    res.json({ ok: true, message, appliedActions });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/tickets/:ticketId/apply-macro", req);
  }
});

// ============================================================
// SLA Policies CRUD
// ============================================================

const slaPolicySchema = z.object({
  priority: z.string(),
  category: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  firstResponseMinutes: z.number().int().positive(),
  resolutionMinutes: z.number().int().positive(),
  escalationJson: z.any().optional(),
});

router.get("/sla-policies", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const policies = await storage.getSlaPolicies(tenantId, (req.query.workspaceId as string) || null);
    res.json(policies);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/sla-policies", req);
  }
});

router.post("/sla-policies", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const body = slaPolicySchema.parse(req.body);
    const policy = await storage.createSlaPolicy({
      tenantId,
      priority: body.priority,
      category: body.category ?? null,
      workspaceId: body.workspaceId ?? null,
      firstResponseMinutes: body.firstResponseMinutes,
      resolutionMinutes: body.resolutionMinutes,
      escalationJson: body.escalationJson ?? {},
    });
    res.status(201).json(policy);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/sla-policies", req);
  }
});

router.put("/sla-policies/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const body = slaPolicySchema.partial().parse(req.body);
    const updated = await storage.updateSlaPolicy(req.params.id, tenantId, body as any);
    if (!updated) throw AppError.notFound("SLA policy");
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PUT /api/v1/support/sla-policies/:id", req);
  }
});

router.delete("/sla-policies/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const deleted = await storage.deleteSlaPolicy(req.params.id, tenantId);
    if (!deleted) throw AppError.notFound("SLA policy");
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/support/sla-policies/:id", req);
  }
});

// ============================================================
// SLA Evaluator: check all open tickets for SLA breaches
// ============================================================

router.post("/sla-evaluate", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const results = await evaluateSlaPolicies(tenantId);
    res.json({ ok: true, ...results });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/sla-evaluate", req);
  }
});

export async function evaluateSlaPolicies(tenantId?: string) {
  const tickets = await storage.getOpenTicketsForSlaCheck(tenantId);
  let firstResponseBreaches = 0;
  let resolutionBreaches = 0;
  const now = new Date();

  for (const ticket of tickets) {
    const policy = await storage.getApplicableSlaPolicy(
      ticket.tenantId,
      ticket.priority,
      ticket.category,
      null
    );
    if (!policy) continue;

    const createdAt = new Date(ticket.createdAt);

    // Check first response SLA
    if (!ticket.firstResponseAt && !ticket.firstResponseBreachedAt) {
      const deadlineMs = createdAt.getTime() + policy.firstResponseMinutes * 60_000;
      if (now.getTime() > deadlineMs) {
        await storage.setTicketSlaBreached(ticket.id, ticket.tenantId, 'firstResponseBreachedAt', now);
        await storage.createSupportTicketEvent({
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorType: 'system',
          eventType: 'sla_breach',
          payloadJson: { type: 'first_response', policyId: policy.id, deadlineMinutes: policy.firstResponseMinutes },
        });
        firstResponseBreaches++;
      }
    }

    // Check resolution SLA
    if (ticket.status !== 'resolved' && ticket.status !== 'closed' && !ticket.resolutionBreachedAt) {
      const resDeadlineMs = createdAt.getTime() + policy.resolutionMinutes * 60_000;
      if (now.getTime() > resDeadlineMs) {
        await storage.setTicketSlaBreached(ticket.id, ticket.tenantId, 'resolutionBreachedAt', now);
        await storage.createSupportTicketEvent({
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          actorType: 'system',
          eventType: 'sla_breach',
          payloadJson: { type: 'resolution', policyId: policy.id, deadlineMinutes: policy.resolutionMinutes },
        });
        resolutionBreaches++;
      }
    }
  }

  return { checked: tickets.length, firstResponseBreaches, resolutionBreaches };
}

// ============================================================
// Ticket Form Schemas CRUD
// ============================================================

const formSchemaBodySchema = z.object({
  category: z.string(),
  workspaceId: z.string().nullable().optional(),
  schemaJson: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(["text", "textarea", "select", "number", "date", "checkbox"]),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
  })),
});

router.get("/form-schemas", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const schemas = await storage.getTicketFormSchemas(tenantId, (req.query.workspaceId as string) || null);
    res.json(schemas);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/form-schemas", req);
  }
});

router.get("/form-schemas/:category", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const schema = await storage.getTicketFormSchema(tenantId, req.params.category, (req.query.workspaceId as string) || null);
    res.json(schema || null);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/support/form-schemas/:category", req);
  }
});

router.post("/form-schemas", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const body = formSchemaBodySchema.parse(req.body);
    const schema = await storage.upsertTicketFormSchema(tenantId, body.category, body.schemaJson, body.workspaceId ?? null);
    res.status(201).json(schema);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/support/form-schemas", req);
  }
});

router.delete("/form-schemas/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const deleted = await storage.deleteTicketFormSchema(req.params.id, tenantId);
    if (!deleted) throw AppError.notFound("Form schema");
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/support/form-schemas/:id", req);
  }
});

export default router;
