import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { requireAuth, requireAdmin } from "../auth";
import {
  clients,
  clientContacts,
  clientCrm,
  clientNotes,
  clientNoteVersions,
  users,
  projects,
  tasks,
  timeEntries,
  updateClientCrmSchema,
  updateClientContactSchema,
  UserRole,
} from "@shared/schema";
import { getCurrentUserId } from "./helpers";

const router = Router();

function isAdminOrSuper(req: Request): boolean {
  return req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.SUPER_USER;
}

async function verifyClientTenancy(clientId: string, tenantId: string): Promise<typeof clients.$inferSelect | null> {
  const [client] = await db.select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  return client || null;
}

const crmContactCreateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  title: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const crmNoteCreateSchema = z.object({
  body: z.unknown(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
});

router.get("/crm/clients/:clientId/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const [crmRow] = await db.select()
      .from(clientCrm)
      .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
      .limit(1);

    const [projectCount] = await db.select({ value: count() })
      .from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const [openTaskCount] = await db.select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          sql`${tasks.projectId} IN (SELECT id FROM projects WHERE client_id = ${clientId} AND tenant_id = ${tenantId})`,
          sql`${tasks.status} NOT IN ('completed', 'archived')`
        )
      );

    const [hoursSums] = await db.select({
      totalHours: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}) / 3600.0, 0)`,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.scope} = 'in_scope' THEN ${timeEntries.durationSeconds} ELSE 0 END) / 3600.0, 0)`,
    })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.tenantId, tenantId),
          sql`${timeEntries.projectId} IN (SELECT id FROM projects WHERE client_id = ${clientId} AND tenant_id = ${tenantId})`
        )
      );

    res.json({
      client: {
        id: client.id,
        companyName: client.companyName,
        displayName: client.displayName,
        email: client.email,
        phone: client.phone,
        status: client.status,
        industry: client.industry,
      },
      crm: crmRow || null,
      counts: {
        projects: projectCount?.value ?? 0,
        openTasks: openTaskCount?.value ?? 0,
        totalHours: Number(hoursSums?.totalHours ?? 0),
        billableHours: Number(hoursSums?.billableHours ?? 0),
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/summary", req);
  }
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
      .where(eq(clientContacts.id, id))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Contact"), req);

    const client = await verifyClientTenancy(existing.clientId, tenantId);
    if (!client) return sendError(res, AppError.forbidden("Access denied"), req);

    const data = validateBody(req.body, updateClientContactSchema, res);
    if (!data) return;

    const [updated] = await db.update(clientContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clientContacts.id, id))
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
      .where(eq(clientContacts.id, id))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Contact"), req);

    const client = await verifyClientTenancy(existing.clientId, tenantId);
    if (!client) return sendError(res, AppError.forbidden("Access denied"), req);

    await db.delete(clientContacts).where(eq(clientContacts.id, id));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/contacts/:id", req);
  }
});

router.patch("/crm/clients/:clientId/crm", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const data = validateBody(req.body, updateClientCrmSchema, res);
    if (!data) return;

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.ownerUserId !== undefined) updateValues.ownerUserId = data.ownerUserId;
    if (data.tags !== undefined) updateValues.tags = data.tags;
    if (data.followUpNotes !== undefined) updateValues.followUpNotes = data.followUpNotes;
    if (data.lastContactAt !== undefined) {
      updateValues.lastContactAt = data.lastContactAt ? new Date(data.lastContactAt) : null;
    }
    if (data.nextFollowUpAt !== undefined) {
      updateValues.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
    }

    const [existingCrm] = await db.select()
      .from(clientCrm)
      .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
      .limit(1);

    let result;
    if (existingCrm) {
      [result] = await db.update(clientCrm)
        .set(updateValues)
        .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
        .returning();
    } else {
      [result] = await db.insert(clientCrm).values({
        clientId,
        tenantId,
        ...updateValues,
      }).returning();
    }

    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/clients/:clientId/crm", req);
  }
});

router.get("/crm/clients/:clientId/notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const notes = await db.select({
      id: clientNotes.id,
      tenantId: clientNotes.tenantId,
      clientId: clientNotes.clientId,
      authorUserId: clientNotes.authorUserId,
      body: clientNotes.body,
      category: clientNotes.category,
      categoryId: clientNotes.categoryId,
      createdAt: clientNotes.createdAt,
      updatedAt: clientNotes.updatedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
      .from(clientNotes)
      .leftJoin(users, eq(clientNotes.authorUserId, users.id))
      .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.tenantId, tenantId)))
      .orderBy(desc(clientNotes.createdAt));

    res.json(notes);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/notes", req);
  }
});

router.post("/crm/clients/:clientId/notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const data = validateBody(req.body, crmNoteCreateSchema, res);
    if (!data) return;

    const userId = getCurrentUserId(req);

    const [note] = await db.insert(clientNotes).values({
      clientId,
      tenantId,
      authorUserId: userId,
      body: data.body,
      category: data.category ?? "general",
      categoryId: data.categoryId ?? null,
    }).returning();

    res.status(201).json(note);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/notes", req);
  }
});

router.delete("/crm/notes/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientNotes)
      .where(and(eq(clientNotes.id, id), eq(clientNotes.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Note"), req);

    const userId = getCurrentUserId(req);
    if (existing.authorUserId !== userId && !isAdminOrSuper(req)) {
      return sendError(res, AppError.forbidden("Only the author or an admin can delete this note"), req);
    }

    await db.delete(clientNoteVersions).where(eq(clientNoteVersions.noteId, id));
    await db.delete(clientNotes).where(eq(clientNotes.id, id));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/notes/:id", req);
  }
});

export default router;
