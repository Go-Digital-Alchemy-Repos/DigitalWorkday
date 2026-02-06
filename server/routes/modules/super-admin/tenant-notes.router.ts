import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { tenantNotes, tenantNoteVersions, users } from '@shared/schema';
import { eq, desc, and, inArray, count, sql } from 'drizzle-orm';
import { z } from 'zod';

export const tenantNotesRouter = Router();

const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required").max(10000, "Note too long"),
  category: z.enum(["onboarding", "support", "billing", "technical", "general", "accounts"]).optional().default("general"),
});

const updateNoteSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
  category: z.enum(["onboarding", "support", "billing", "technical", "general", "accounts"]).optional(),
});

tenantNotesRouter.get("/tenants/:tenantId/notes", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const notes = await db.select({
      id: tenantNotes.id,
      tenantId: tenantNotes.tenantId,
      authorUserId: tenantNotes.authorUserId,
      lastEditedByUserId: tenantNotes.lastEditedByUserId,
      body: tenantNotes.body,
      category: tenantNotes.category,
      createdAt: tenantNotes.createdAt,
      updatedAt: tenantNotes.updatedAt,
    })
      .from(tenantNotes)
      .where(eq(tenantNotes.tenantId, tenantId))
      .orderBy(desc(tenantNotes.createdAt));

    const noteIds = notes.map(n => n.id);
    let versionCounts: Map<string, number> = new Map();
    if (noteIds.length > 0) {
      const versionCountResults = await db.select({
        noteId: tenantNoteVersions.noteId,
        count: count(),
      })
        .from(tenantNoteVersions)
        .where(inArray(tenantNoteVersions.noteId, noteIds))
        .groupBy(tenantNoteVersions.noteId);
      
      versionCountResults.forEach(v => versionCounts.set(v.noteId, v.count));
    }

    const userIds = Array.from(new Set(notes.map(n => n.authorUserId)));
    const authorUsers = userIds.length > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const authorMap = new Map(authorUsers.map(u => [u.id, u]));

    const enrichedNotes = notes.map(note => ({
      ...note,
      author: authorMap.get(note.authorUserId) || { id: note.authorUserId, name: "Unknown", email: "" },
      versionCount: versionCounts.get(note.id) || 0,
      hasVersions: (versionCounts.get(note.id) || 0) > 0,
    }));

    res.json(enrichedNotes);
  } catch (error) {
    console.error("Error fetching tenant notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

tenantNotesRouter.post("/tenants/:tenantId/notes", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createNoteSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const superUser = req.user as any;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [note] = await db.insert(tenantNotes).values({
      tenantId,
      authorUserId: superUser.id,
      body: data.body,
      category: data.category,
    }).returning();

    res.status(201).json({
      ...note,
      author: { id: superUser.id, name: superUser.name || "Super Admin", email: superUser.email },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant note:", error);
    res.status(500).json({ error: "Failed to create note" });
  }
});

tenantNotesRouter.patch("/tenants/:tenantId/notes/:noteId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, noteId } = req.params;
    const data = updateNoteSchema.parse(req.body);
    const editorUserId = req.user?.id;

    if (!editorUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingNote] = await db.select().from(tenantNotes)
      .where(and(eq(tenantNotes.id, noteId), eq(tenantNotes.tenantId, tenantId)));
    
    if (!existingNote) {
      return res.status(404).json({ error: "Note not found" });
    }

    const [latestVersion] = await db.select({ maxVersion: sql<number>`COALESCE(MAX(${tenantNoteVersions.versionNumber}), 0)` })
      .from(tenantNoteVersions)
      .where(eq(tenantNoteVersions.noteId, noteId));
    
    const nextVersionNumber = (latestVersion?.maxVersion || 0) + 1;

    await db.insert(tenantNoteVersions).values({
      noteId: noteId,
      tenantId: tenantId,
      editorUserId: existingNote.lastEditedByUserId || existingNote.authorUserId,
      body: existingNote.body,
      category: existingNote.category,
      versionNumber: nextVersionNumber,
      createdAt: existingNote.updatedAt || existingNote.createdAt,
    });

    const [updated] = await db.update(tenantNotes)
      .set({
        ...data,
        lastEditedByUserId: editorUserId,
        updatedAt: new Date(),
      })
      .where(eq(tenantNotes.id, noteId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating note:", error);
    res.status(500).json({ error: "Failed to update note" });
  }
});

tenantNotesRouter.get("/tenants/:tenantId/notes/:noteId/versions", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, noteId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingNote] = await db.select().from(tenantNotes)
      .where(and(eq(tenantNotes.id, noteId), eq(tenantNotes.tenantId, tenantId)));
    
    if (!existingNote) {
      return res.status(404).json({ error: "Note not found" });
    }

    const versions = await db.select({
      id: tenantNoteVersions.id,
      noteId: tenantNoteVersions.noteId,
      editorUserId: tenantNoteVersions.editorUserId,
      body: tenantNoteVersions.body,
      category: tenantNoteVersions.category,
      versionNumber: tenantNoteVersions.versionNumber,
      createdAt: tenantNoteVersions.createdAt,
    })
      .from(tenantNoteVersions)
      .where(eq(tenantNoteVersions.noteId, noteId))
      .orderBy(desc(tenantNoteVersions.versionNumber));

    const editorIds = Array.from(new Set(versions.map(v => v.editorUserId)));
    let editorMap: Record<string, { id: string; firstName: string | null; lastName: string | null; email: string }> = {};
    
    if (editorIds.length > 0) {
      const editors = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      }).from(users).where(inArray(users.id, editorIds));
      
      editors.forEach(editor => {
        editorMap[editor.id] = editor;
      });
    }

    const versionsWithEditors = versions.map(version => ({
      ...version,
      editor: editorMap[version.editorUserId] || { id: version.editorUserId, firstName: null, lastName: null, email: "Unknown" },
    }));

    res.json({
      currentNote: existingNote,
      versions: versionsWithEditors,
      totalVersions: versions.length,
    });
  } catch (error) {
    console.error("Error fetching note versions:", error);
    res.status(500).json({ error: "Failed to fetch note versions" });
  }
});

tenantNotesRouter.delete("/tenants/:tenantId/notes/:noteId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, noteId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingNote] = await db.select().from(tenantNotes)
      .where(and(eq(tenantNotes.id, noteId), eq(tenantNotes.tenantId, tenantId)));
    
    if (!existingNote) {
      return res.status(404).json({ error: "Note not found" });
    }

    await db.delete(tenantNotes).where(eq(tenantNotes.id, noteId));

    res.json({ success: true, message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(500).json({ error: "Failed to delete note" });
  }
});
