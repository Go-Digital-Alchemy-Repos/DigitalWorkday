import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import {
  projectNotes,
  projectNoteVersions,
  projectNoteCategories,
  projects,
  users,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { requireTenantContext, TenantRequest } from "../../middleware/tenantContext";
import { AppError, handleRouteError } from "../../lib/errors";

const router = Router();

const createNoteSchema = z.object({
  body: z.any(),
  category: z.string().optional().default("general"),
  categoryId: z.string().uuid().optional().nullable(),
});

const updateNoteSchema = z.object({
  body: z.any(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
});

router.get("/projects/:projectId/notes/categories", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const categories = await db.select()
      .from(projectNoteCategories)
      .where(eq(projectNoteCategories.tenantId, tenantId))
      .orderBy(projectNoteCategories.name);

    res.json({ ok: true, categories });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.getCategories", req);
  }
});

router.post("/projects/:projectId/notes/categories", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const data = createCategorySchema.parse(req.body);

    const [category] = await db.insert(projectNoteCategories)
      .values({
        tenantId,
        name: data.name,
        color: data.color,
        isSystem: false,
      })
      .returning();

    res.json({ ok: true, category });
  } catch (error: any) {
    if (error.code === "23505") {
      return handleRouteError(res, AppError.conflict("Category with this name already exists"), "projectNotes.createCategory", req);
    }
    handleRouteError(res, error, "projectNotes.createCategory", req);
  }
});

router.put("/projects/:projectId/notes/categories/:categoryId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { categoryId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const data = createCategorySchema.parse(req.body);

    const [existing] = await db.select()
      .from(projectNoteCategories)
      .where(and(
        eq(projectNoteCategories.id, categoryId),
        eq(projectNoteCategories.tenantId, tenantId)
      ));

    if (!existing) {
      throw AppError.notFound("Category");
    }

    if (existing.isSystem) {
      throw AppError.badRequest("Cannot edit system categories");
    }

    const [category] = await db.update(projectNoteCategories)
      .set({
        name: data.name,
        color: data.color,
      })
      .where(eq(projectNoteCategories.id, categoryId))
      .returning();

    res.json({ ok: true, category });
  } catch (error: any) {
    if (error.code === "23505") {
      return handleRouteError(res, AppError.conflict("Category with this name already exists"), "projectNotes.updateCategory", req);
    }
    handleRouteError(res, error, "projectNotes.updateCategory", req);
  }
});

router.delete("/projects/:projectId/notes/categories/:categoryId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { categoryId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const [existing] = await db.select()
      .from(projectNoteCategories)
      .where(and(
        eq(projectNoteCategories.id, categoryId),
        eq(projectNoteCategories.tenantId, tenantId)
      ));

    if (!existing) {
      throw AppError.notFound("Category");
    }

    if (existing.isSystem) {
      throw AppError.badRequest("Cannot delete system categories");
    }

    await db.update(projectNotes)
      .set({ categoryId: null, category: "general" })
      .where(and(
        eq(projectNotes.categoryId, categoryId),
        eq(projectNotes.tenantId, tenantId)
      ));

    await db.delete(projectNoteCategories).where(and(
      eq(projectNoteCategories.id, categoryId),
      eq(projectNoteCategories.tenantId, tenantId)
    ));

    res.json({ ok: true, message: "Category deleted successfully" });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.deleteCategory", req);
  }
});

router.get("/projects/:projectId/notes", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { projectId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const [project] = await db.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    ).limit(1);

    if (!project) {
      throw AppError.notFound("Project");
    }

    const notes = await db.select({
      id: projectNotes.id,
      projectId: projectNotes.projectId,
      body: projectNotes.body,
      category: projectNotes.category,
      categoryId: projectNotes.categoryId,
      createdAt: projectNotes.createdAt,
      updatedAt: projectNotes.updatedAt,
      authorUserId: projectNotes.authorUserId,
      lastEditedByUserId: projectNotes.lastEditedByUserId,
      tenantId: projectNotes.tenantId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      authorEmail: users.email,
    })
      .from(projectNotes)
      .leftJoin(users, eq(projectNotes.authorUserId, users.id))
      .where(and(
        eq(projectNotes.projectId, projectId),
        eq(projectNotes.tenantId, tenantId)
      ))
      .orderBy(desc(projectNotes.createdAt));

    const notesWithVersionCount = await Promise.all(notes.map(async (note) => {
      const [versionCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(projectNoteVersions)
        .where(and(
          eq(projectNoteVersions.noteId, note.id),
          eq(projectNoteVersions.tenantId, tenantId)
        ));

      return {
        ...note,
        versionCount: versionCount?.count || 0,
        author: {
          firstName: note.authorFirstName,
          lastName: note.authorLastName,
          email: note.authorEmail,
        },
      };
    }));

    res.json({ ok: true, notes: notesWithVersionCount });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.getNotes", req);
  }
});

router.post("/projects/:projectId/notes", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { projectId } = req.params;

  if (!tenantId || !userId) {
    throw AppError.badRequest("Tenant and user context required");
  }

  try {
    const data = createNoteSchema.parse(req.body);

    const [project] = await db.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    ).limit(1);

    if (!project) {
      throw AppError.notFound("Project");
    }

    const [note] = await db.insert(projectNotes)
      .values({
        tenantId,
        projectId,
        authorUserId: userId,
        body: data.body,
        category: data.category,
        categoryId: data.categoryId,
      })
      .returning();

    res.json({ ok: true, note });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.createNote", req);
  }
});

router.get("/projects/:projectId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { projectId, noteId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const [note] = await db.select()
      .from(projectNotes)
      .where(and(
        eq(projectNotes.id, noteId),
        eq(projectNotes.projectId, projectId),
        eq(projectNotes.tenantId, tenantId)
      ));

    if (!note) {
      throw AppError.notFound("Note");
    }

    const versions = await db.select()
      .from(projectNoteVersions)
      .where(and(
        eq(projectNoteVersions.noteId, noteId),
        eq(projectNoteVersions.tenantId, tenantId)
      ))
      .orderBy(desc(projectNoteVersions.versionNumber));

    res.json({ ok: true, note, versions });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.getNote", req);
  }
});

router.put("/projects/:projectId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { projectId, noteId } = req.params;

  if (!tenantId || !userId) {
    throw AppError.badRequest("Tenant and user context required");
  }

  try {
    const data = updateNoteSchema.parse(req.body);

    const [existingNote] = await db.select()
      .from(projectNotes)
      .where(and(
        eq(projectNotes.id, noteId),
        eq(projectNotes.projectId, projectId),
        eq(projectNotes.tenantId, tenantId)
      ));

    if (!existingNote) {
      throw AppError.notFound("Note");
    }

    const [versionCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(projectNoteVersions)
      .where(and(
        eq(projectNoteVersions.noteId, noteId),
        eq(projectNoteVersions.tenantId, tenantId)
      ));

    await db.insert(projectNoteVersions).values({
      noteId,
      tenantId,
      editorUserId: existingNote.lastEditedByUserId || existingNote.authorUserId,
      body: existingNote.body,
      category: existingNote.category,
      categoryId: existingNote.categoryId,
      versionNumber: (versionCount?.count || 0) + 1,
    });

    const [updatedNote] = await db.update(projectNotes)
      .set({
        body: data.body,
        category: data.category,
        categoryId: data.categoryId,
        lastEditedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(projectNotes.id, noteId))
      .returning();

    res.json({ ok: true, note: updatedNote });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.updateNote", req);
  }
});

router.delete("/projects/:projectId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { projectId, noteId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const [existingNote] = await db.select()
      .from(projectNotes)
      .where(and(
        eq(projectNotes.id, noteId),
        eq(projectNotes.projectId, projectId),
        eq(projectNotes.tenantId, tenantId)
      ));

    if (!existingNote) {
      throw AppError.notFound("Note");
    }

    await db.delete(projectNotes).where(and(
      eq(projectNotes.id, noteId),
      eq(projectNotes.tenantId, tenantId)
    ));

    res.json({ ok: true, message: "Note deleted successfully" });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.deleteNote", req);
  }
});

router.get("/projects/:projectId/notes/:noteId/versions", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { noteId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const versions = await db.select({
      id: projectNoteVersions.id,
      noteId: projectNoteVersions.noteId,
      body: projectNoteVersions.body,
      category: projectNoteVersions.category,
      categoryId: projectNoteVersions.categoryId,
      versionNumber: projectNoteVersions.versionNumber,
      createdAt: projectNoteVersions.createdAt,
      editorUserId: projectNoteVersions.editorUserId,
      editorFirstName: users.firstName,
      editorLastName: users.lastName,
    })
      .from(projectNoteVersions)
      .leftJoin(users, eq(projectNoteVersions.editorUserId, users.id))
      .where(and(
        eq(projectNoteVersions.noteId, noteId),
        eq(projectNoteVersions.tenantId, tenantId)
      ))
      .orderBy(desc(projectNoteVersions.versionNumber));

    res.json({ ok: true, versions });
  } catch (error: any) {
    handleRouteError(res, error, "projectNotes.getVersions", req);
  }
});

export default router;
