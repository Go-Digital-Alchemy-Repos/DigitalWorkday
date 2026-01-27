import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import { 
  clientNotes, 
  clientNoteVersions, 
  clientNoteCategories, 
  clientNoteAttachments,
  users,
  clients 
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { requireTenantContext, TenantRequest } from "../../middleware/tenantContext";

const router = Router();

const createNoteSchema = z.object({
  clientId: z.string().uuid(),
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

router.get("/:clientId/notes/categories", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const categories = await db.select()
      .from(clientNoteCategories)
      .where(eq(clientNoteCategories.tenantId, tenantId))
      .orderBy(clientNoteCategories.name);

    res.json({ ok: true, categories });
  } catch (error: any) {
    console.error("[client-notes] Error fetching categories:", error);
    res.status(500).json({ ok: false, error: { code: "FETCH_FAILED", message: "Failed to fetch categories" } });
  }
});

router.post("/:clientId/notes/categories", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const data = createCategorySchema.parse(req.body);

    const [category] = await db.insert(clientNoteCategories)
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
      return res.status(400).json({ ok: false, error: { code: "DUPLICATE_CATEGORY", message: "Category with this name already exists" } });
    }
    console.error("[client-notes] Error creating category:", error);
    res.status(500).json({ ok: false, error: { code: "CREATE_FAILED", message: "Failed to create category" } });
  }
});

router.get("/:clientId/notes", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const client = await db.select().from(clients).where(
      and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))
    ).limit(1);

    if (!client.length) {
      return res.status(404).json({ ok: false, error: { code: "CLIENT_NOT_FOUND", message: "Client not found" } });
    }

    const notes = await db.select({
      id: clientNotes.id,
      clientId: clientNotes.clientId,
      body: clientNotes.body,
      category: clientNotes.category,
      categoryId: clientNotes.categoryId,
      createdAt: clientNotes.createdAt,
      updatedAt: clientNotes.updatedAt,
      authorUserId: clientNotes.authorUserId,
      lastEditedByUserId: clientNotes.lastEditedByUserId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      authorEmail: users.email,
    })
      .from(clientNotes)
      .leftJoin(users, eq(clientNotes.authorUserId, users.id))
      .where(and(
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ))
      .orderBy(desc(clientNotes.createdAt));

    const notesWithVersionCount = await Promise.all(notes.map(async (note) => {
      const [versionCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(clientNoteVersions)
        .where(and(
          eq(clientNoteVersions.noteId, note.id),
          eq(clientNoteVersions.tenantId, tenantId)
        ));

      const attachments = await db.select()
        .from(clientNoteAttachments)
        .where(and(
          eq(clientNoteAttachments.noteId, note.id),
          eq(clientNoteAttachments.tenantId, tenantId)
        ));

      return {
        ...note,
        versionCount: versionCount?.count || 0,
        attachments,
        author: {
          firstName: note.authorFirstName,
          lastName: note.authorLastName,
          email: note.authorEmail,
        },
      };
    }));

    res.json({ ok: true, notes: notesWithVersionCount });
  } catch (error: any) {
    console.error("[client-notes] Error fetching notes:", error);
    res.status(500).json({ ok: false, error: { code: "FETCH_FAILED", message: "Failed to fetch notes" } });
  }
});

router.post("/:clientId/notes", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { clientId } = req.params;

  if (!tenantId || !userId) {
    return res.status(400).json({ ok: false, error: { code: "CONTEXT_REQUIRED", message: "Tenant and user context required" } });
  }

  try {
    const data = createNoteSchema.parse({ ...req.body, clientId });

    const client = await db.select().from(clients).where(
      and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))
    ).limit(1);

    if (!client.length) {
      return res.status(404).json({ ok: false, error: { code: "CLIENT_NOT_FOUND", message: "Client not found" } });
    }

    const [note] = await db.insert(clientNotes)
      .values({
        tenantId,
        clientId,
        authorUserId: userId,
        body: data.body,
        category: data.category,
        categoryId: data.categoryId,
      })
      .returning();

    res.json({ ok: true, note });
  } catch (error: any) {
    console.error("[client-notes] Error creating note:", error);
    res.status(500).json({ ok: false, error: { code: "CREATE_FAILED", message: "Failed to create note" } });
  }
});

router.get("/:clientId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, noteId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const [note] = await db.select()
      .from(clientNotes)
      .where(and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ));

    if (!note) {
      return res.status(404).json({ ok: false, error: { code: "NOTE_NOT_FOUND", message: "Note not found" } });
    }

    const versions = await db.select()
      .from(clientNoteVersions)
      .where(and(
        eq(clientNoteVersions.noteId, noteId),
        eq(clientNoteVersions.tenantId, tenantId)
      ))
      .orderBy(desc(clientNoteVersions.versionNumber));

    const attachments = await db.select()
      .from(clientNoteAttachments)
      .where(and(
        eq(clientNoteAttachments.noteId, noteId),
        eq(clientNoteAttachments.tenantId, tenantId)
      ));

    res.json({ ok: true, note, versions, attachments });
  } catch (error: any) {
    console.error("[client-notes] Error fetching note:", error);
    res.status(500).json({ ok: false, error: { code: "FETCH_FAILED", message: "Failed to fetch note" } });
  }
});

router.put("/:clientId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { clientId, noteId } = req.params;

  if (!tenantId || !userId) {
    return res.status(400).json({ ok: false, error: { code: "CONTEXT_REQUIRED", message: "Tenant and user context required" } });
  }

  try {
    const data = updateNoteSchema.parse(req.body);

    const [existingNote] = await db.select()
      .from(clientNotes)
      .where(and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ));

    if (!existingNote) {
      return res.status(404).json({ ok: false, error: { code: "NOTE_NOT_FOUND", message: "Note not found" } });
    }

    const [versionCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(clientNoteVersions)
      .where(and(
        eq(clientNoteVersions.noteId, noteId),
        eq(clientNoteVersions.tenantId, tenantId)
      ));

    await db.insert(clientNoteVersions).values({
      noteId,
      tenantId,
      editorUserId: existingNote.lastEditedByUserId || existingNote.authorUserId,
      body: existingNote.body,
      category: existingNote.category,
      categoryId: existingNote.categoryId,
      versionNumber: (versionCount?.count || 0) + 1,
    });

    const [updatedNote] = await db.update(clientNotes)
      .set({
        body: data.body,
        category: data.category,
        categoryId: data.categoryId,
        lastEditedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(clientNotes.id, noteId))
      .returning();

    res.json({ ok: true, note: updatedNote });
  } catch (error: any) {
    console.error("[client-notes] Error updating note:", error);
    res.status(500).json({ ok: false, error: { code: "UPDATE_FAILED", message: "Failed to update note" } });
  }
});

router.delete("/:clientId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, noteId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const [existingNote] = await db.select()
      .from(clientNotes)
      .where(and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ));

    if (!existingNote) {
      return res.status(404).json({ ok: false, error: { code: "NOTE_NOT_FOUND", message: "Note not found" } });
    }

    await db.delete(clientNotes).where(eq(clientNotes.id, noteId));

    res.json({ ok: true, message: "Note deleted successfully" });
  } catch (error: any) {
    console.error("[client-notes] Error deleting note:", error);
    res.status(500).json({ ok: false, error: { code: "DELETE_FAILED", message: "Failed to delete note" } });
  }
});

router.get("/:clientId/notes/:noteId/versions", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { noteId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const versions = await db.select({
      id: clientNoteVersions.id,
      noteId: clientNoteVersions.noteId,
      body: clientNoteVersions.body,
      category: clientNoteVersions.category,
      categoryId: clientNoteVersions.categoryId,
      versionNumber: clientNoteVersions.versionNumber,
      createdAt: clientNoteVersions.createdAt,
      editorUserId: clientNoteVersions.editorUserId,
      editorFirstName: users.firstName,
      editorLastName: users.lastName,
    })
      .from(clientNoteVersions)
      .leftJoin(users, eq(clientNoteVersions.editorUserId, users.id))
      .where(and(
        eq(clientNoteVersions.noteId, noteId),
        eq(clientNoteVersions.tenantId, tenantId)
      ))
      .orderBy(desc(clientNoteVersions.versionNumber));

    res.json({ ok: true, versions });
  } catch (error: any) {
    console.error("[client-notes] Error fetching versions:", error);
    res.status(500).json({ ok: false, error: { code: "FETCH_FAILED", message: "Failed to fetch versions" } });
  }
});

export default router;
