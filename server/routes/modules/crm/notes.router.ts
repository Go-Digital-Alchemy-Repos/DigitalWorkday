import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { requireAuth } from "../../../auth";
import {
  clientNotes,
  clientNoteVersions,
  clientNoteCategories,
  users,
  UserRole,
} from "@shared/schema";
import { getCurrentUserId } from "../../helpers";
import { isAdminOrSuper, verifyClientTenancy } from "./crm.helpers";

const router = Router();

function rejectClientPortalUsers(req: Request, res: Response, next: import("express").NextFunction) {
  if (req.user?.role === UserRole.CLIENT) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Notes are internal only." } });
  }
  next();
}

router.use(rejectClientPortalUsers);

const crmNoteCreateSchema = z.object({
  body: z.unknown(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
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

router.put("/crm/notes/:id", requireAuth, async (req: Request, res: Response) => {
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
      return sendError(res, AppError.forbidden("Only the author or an admin can edit this note"), req);
    }

    const data = validateBody(req.body, crmNoteCreateSchema, res);
    if (!data) return;

    const [versionCountResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(clientNoteVersions)
      .where(and(eq(clientNoteVersions.noteId, id), eq(clientNoteVersions.tenantId, tenantId)));

    await db.insert(clientNoteVersions).values({
      noteId: id,
      tenantId,
      editorUserId: userId,
      body: existing.body,
      category: existing.category,
      categoryId: existing.categoryId,
      versionNumber: (versionCountResult?.count || 0) + 1,
    });

    const [updated] = await db.update(clientNotes)
      .set({
        body: data.body,
        category: data.category ?? existing.category,
        categoryId: data.categoryId ?? existing.categoryId,
        lastEditedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(clientNotes.id, id), eq(clientNotes.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PUT /api/crm/notes/:id", req);
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

    await db.delete(clientNoteVersions).where(and(eq(clientNoteVersions.noteId, id), eq(clientNoteVersions.tenantId, tenantId)));
    await db.delete(clientNotes).where(and(eq(clientNotes.id, id), eq(clientNotes.tenantId, tenantId)));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/notes/:id", req);
  }
});

router.get("/crm/clients/:clientId/notes/categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const categories = await db.select()
      .from(clientNoteCategories)
      .where(eq(clientNoteCategories.tenantId, tenantId))
      .orderBy(clientNoteCategories.name);

    res.json({ ok: true, categories });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/notes/categories", req);
  }
});

export default router;
