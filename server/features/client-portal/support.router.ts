import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { storage } from "../../storage";
import { UserRole, SupportTicketSource, SupportTicketAuthorType, SupportTicketEventType, SupportTicketStatus } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { getClientUserAccessibleClients } from "../../middleware/clientAccess";
import { handleRouteError, AppError } from "../../lib/errors";
import {
  MAX_COMMUNICATION_ATTACHMENTS,
  MAX_COMMUNICATION_ATTACHMENT_BYTES,
  createCommunicationAttachmentDownload,
  deleteCommunicationAttachments,
  findCommunicationAttachment,
  toPublicCommunicationAttachments,
  uploadCommunicationAttachments,
} from "../../services/communicationAttachments";

const router = Router();
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COMMUNICATION_ATTACHMENT_BYTES, files: MAX_COMMUNICATION_ATTACHMENTS },
});

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

const addReplySchema = z.object({ bodyText: z.string().optional().default("") });

function parseOptionalJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw AppError.badRequest("Invalid metadata JSON");
  }
}

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
        return {
          ...m,
          attachmentsJson: undefined,
          attachments: toPublicCommunicationAttachments(m.attachmentsJson),
          author: author ? { id: author.id, name: author.name, email: author.email } : null,
        };
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

router.post("/tickets", attachmentUpload.array("files", MAX_COMMUNICATION_ATTACHMENTS), async (req, res) => {
  let uploadedAttachments: Awaited<ReturnType<typeof uploadCommunicationAttachments>> = [];
  let attachmentsPersisted = false;
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const body = createTicketSchema.parse({
      ...req.body,
      metadataJson: parseOptionalJson(req.body.metadataJson),
    });
    const files = ((req as any).files || []) as Express.Multer.File[];

    const clientIds = await getClientUserAccessibleClients(userId);
    if (!clientIds.includes(body.clientId)) {
      throw AppError.forbidden("You do not have access to this client");
    }

    uploadedAttachments = await uploadCommunicationAttachments(files, {
      tenantId,
      kind: "support-ticket",
      contextId: body.clientId,
    });

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

    if (body.description || uploadedAttachments.length > 0) {
      await storage.createSupportTicketMessage({
        tenantId,
        ticketId: ticket.id,
        authorType: SupportTicketAuthorType.PORTAL_USER,
        authorUserId: null,
        authorPortalUserId: userId,
        bodyText: body.description || "",
        attachmentsJson: uploadedAttachments.length > 0 ? uploadedAttachments : null,
        visibility: "public",
      });
      attachmentsPersisted = true;
    }

    res.status(201).json(ticket);
  } catch (error) {
    if (!attachmentsPersisted && uploadedAttachments.length > 0 && req.user?.tenantId) {
      await deleteCommunicationAttachments(uploadedAttachments, req.user.tenantId);
    }
    return handleRouteError(res, error, "POST /api/v1/portal/support/tickets", req);
  }
});

router.post("/tickets/:id/messages", attachmentUpload.array("files", MAX_COMMUNICATION_ATTACHMENTS), async (req, res) => {
  let uploadedAttachments: Awaited<ReturnType<typeof uploadCommunicationAttachments>> = [];
  let attachmentsPersisted = false;
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
    const files = ((req as any).files || []) as Express.Multer.File[];
    if (!body.bodyText.trim() && files.length === 0) {
      throw AppError.badRequest("A message or attachment is required");
    }

    uploadedAttachments = await uploadCommunicationAttachments(files, {
      tenantId,
      kind: "support-ticket",
      contextId: ticket.id,
    });

    const message = await storage.createSupportTicketMessage({
      tenantId,
      ticketId: ticket.id,
      authorType: SupportTicketAuthorType.PORTAL_USER,
      authorUserId: null,
      authorPortalUserId: userId,
      bodyText: body.bodyText,
      attachmentsJson: uploadedAttachments.length > 0 ? uploadedAttachments : null,
      visibility: "public",
    });
    attachmentsPersisted = true;

    if (ticket.status === SupportTicketStatus.WAITING_ON_CLIENT) {
      await storage.updateSupportTicket(ticket.id, tenantId, {
        status: SupportTicketStatus.OPEN,
      } as any);
    }

    res.status(201).json({
      ...message,
      attachmentsJson: undefined,
      attachments: toPublicCommunicationAttachments(message.attachmentsJson),
    });
  } catch (error) {
    if (!attachmentsPersisted && uploadedAttachments.length > 0 && req.user?.tenantId) {
      await deleteCommunicationAttachments(uploadedAttachments, req.user.tenantId);
    }
    return handleRouteError(res, error, "POST /api/v1/portal/support/tickets/:id/messages", req);
  }
});

router.get("/tickets/:id/attachments/:attachmentId/download", async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket || ticket.tenantId !== tenantId) throw AppError.notFound("Support ticket");

    const clientIds = await getClientUserAccessibleClients(userId);
    if (!ticket.clientId || !clientIds.includes(ticket.clientId)) {
      throw AppError.forbidden("You do not have access to this ticket");
    }

    const messages = await storage.getSupportTicketMessages(ticket.id, tenantId, false);
    const attachment = findCommunicationAttachment(
      messages.map((message) => message.attachmentsJson),
      req.params.attachmentId,
    );
    if (!attachment) throw AppError.notFound("Attachment");

    res.json(await createCommunicationAttachmentDownload(attachment, tenantId));
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/portal/support/tickets/:id/attachments/:attachmentId/download", req);
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
