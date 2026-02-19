import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { UserRole, SupportTicketSource, SupportTicketAuthorType, SupportTicketEventType, SupportTicketStatus } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { getClientUserAccessibleClients } from "../../middleware/clientAccess";
import { handleRouteError, AppError } from "../../lib/errors";

const router = Router();

function requireClientRole(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.CLIENT) {
    throw AppError.forbidden("This endpoint is only accessible to client portal users");
  }
  next();
}

router.use(requireClientRole);

const createTicketSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  category: z.enum(["support", "work_order", "billing", "bug", "feature_request"]).optional().default("support"),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  metadataJson: z.record(z.any()).optional().nullable(),
});

const addReplySchema = z.object({
  bodyText: z.string().min(1),
});

router.get("/tickets", async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const clientIds = await getClientUserAccessibleClients(userId);
    if (clientIds.length === 0) {
      return res.json({ tickets: [], total: 0 });
    }

    const { status, limit, offset } = req.query;
    const allTickets: any[] = [];
    let totalCount = 0;

    for (const clientId of clientIds) {
      const result = await storage.getSupportTicketsByClient(tenantId, clientId, {
        status: status as string | undefined,
        limit: 100,
        offset: 0,
      });
      allTickets.push(...result.tickets);
      totalCount += result.total;
    }

    allTickets.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

    const lim = limit ? parseInt(limit as string) : 50;
    const off = offset ? parseInt(offset as string) : 0;
    const paged = allTickets.slice(off, off + lim);

    res.json({ tickets: paged, total: totalCount });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/portal/support/tickets", req);
  }
});

router.get("/tickets/:id", async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw AppError.notFound("Support ticket");
    }

    const clientIds = await getClientUserAccessibleClients(userId);
    if (!ticket.clientId || !clientIds.includes(ticket.clientId)) {
      throw AppError.forbidden("You do not have access to this ticket");
    }

    const messages = await storage.getSupportTicketMessages(ticket.id, tenantId, false);
    const messagesWithAuthors = await Promise.all(
      messages.map(async (m) => {
        const author = m.authorUserId ? await storage.getUser(m.authorUserId) : m.authorPortalUserId ? await storage.getUser(m.authorPortalUserId) : null;
        return { ...m, author: author ? { id: author.id, name: author.name, email: author.email } : null };
      })
    );

    const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;

    res.json({
      ...ticket,
      client: client ? { id: client.id, companyName: client.companyName } : null,
      messages: messagesWithAuthors,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/portal/support/tickets/:id", req);
  }
});

router.post("/tickets", async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const body = createTicketSchema.parse(req.body);

    const clientIds = await getClientUserAccessibleClients(userId);
    if (!clientIds.includes(body.clientId)) {
      throw AppError.forbidden("You do not have access to this client");
    }

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
      clientId: body.clientId,
      createdByUserId: null,
      createdByPortalUserId: userId,
      title: body.title,
      description: body.description || null,
      priority: body.priority,
      category: body.category,
      source: SupportTicketSource.PORTAL,
      assignedToUserId: null,
      dueAt: null,
      metadataJson: body.metadataJson ?? null,
    });

    await storage.createSupportTicketEvent({
      tenantId,
      ticketId: ticket.id,
      actorType: SupportTicketAuthorType.PORTAL_USER,
      actorPortalUserId: userId,
      eventType: SupportTicketEventType.CREATED,
      payloadJson: { title: ticket.title },
    });

    if (body.description) {
      await storage.createSupportTicketMessage({
        tenantId,
        ticketId: ticket.id,
        authorType: SupportTicketAuthorType.PORTAL_USER,
        authorUserId: null,
        authorPortalUserId: userId,
        bodyText: body.description,
        visibility: "public",
      });
    }

    res.status(201).json(ticket);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/portal/support/tickets", req);
  }
});

router.post("/tickets/:id/messages", async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw AppError.notFound("Support ticket");
    }

    const clientIds = await getClientUserAccessibleClients(userId);
    if (!ticket.clientId || !clientIds.includes(ticket.clientId)) {
      throw AppError.forbidden("You do not have access to this ticket");
    }

    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw AppError.badRequest("Cannot reply to a closed ticket");
    }

    const body = addReplySchema.parse(req.body);

    const message = await storage.createSupportTicketMessage({
      tenantId,
      ticketId: ticket.id,
      authorType: SupportTicketAuthorType.PORTAL_USER,
      authorUserId: null,
      authorPortalUserId: userId,
      bodyText: body.bodyText,
      visibility: "public",
    });

    if (ticket.status === SupportTicketStatus.WAITING_ON_CLIENT) {
      await storage.updateSupportTicket(ticket.id, tenantId, {
        status: SupportTicketStatus.OPEN,
      } as any);
    }

    res.status(201).json(message);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/portal/support/tickets/:id/messages", req);
  }
});

// Portal: get form schema for a category (so portal can render dynamic fields)
router.get("/form-schemas/:category", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    const schema = await storage.getTicketFormSchema(tenantId, req.params.category);
    res.json(schema || null);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/portal/support/form-schemas/:category", req);
  }
});

export default router;
