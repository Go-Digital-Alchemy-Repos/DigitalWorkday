import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, desc } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { requireAuth } from "../../../auth";
import {
  clientContacts,
  updateClientContactSchema,
} from "@shared/schema";
import { verifyClientTenancy } from "./crm.helpers";

const router = Router();

const crmContactCreateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  title: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

router.get("/crm/clients/:clientId/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const contacts = await db.select()
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, clientId), eq(clientContacts.workspaceId, client.workspaceId)))
      .orderBy(desc(clientContacts.isPrimary), clientContacts.createdAt);

    res.json(contacts);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/contacts", req);
  }
});

router.post("/crm/clients/:clientId/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const data = validateBody(req.body, crmContactCreateSchema, res);
    if (!data) return;

    const [contact] = await db.insert(clientContacts).values({
      clientId,
      tenantId,
      workspaceId: client.workspaceId,
      firstName: data.firstName,
      lastName: data.lastName,
      title: data.title,
      email: data.email ?? null,
      phone: data.phone ?? null,
      isPrimary: data.isPrimary ?? false,
      notes: data.notes ?? null,
    }).returning();

    res.status(201).json(contact);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/contacts", req);
  }
});

router.patch("/crm/contacts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientContacts)
      .where(and(eq(clientContacts.id, id), eq(clientContacts.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Contact"), req);

    const data = validateBody(req.body, updateClientContactSchema, res);
    if (!data) return;

    const [updated] = await db.update(clientContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(clientContacts.id, id), eq(clientContacts.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/contacts/:id", req);
  }
});

router.delete("/crm/contacts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientContacts)
      .where(and(eq(clientContacts.id, id), eq(clientContacts.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Contact"), req);

    await db.delete(clientContacts).where(and(eq(clientContacts.id, id), eq(clientContacts.tenantId, tenantId)));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/contacts/:id", req);
  }
});

export default router;
