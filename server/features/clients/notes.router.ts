import { Router, Request, Response } from "express";
import crypto from "crypto";
import multer from "multer";
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
import { AppError, handleRouteError } from "../../lib/errors";
import {
  isS3Configured,
  validateFile,
  uploadToS3,
  createPresignedDownloadUrl,
  ALLOWED_MIME_TYPES,
} from "../../s3";

const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

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
    throw AppError.tenantRequired();
  }

  try {
    const categories = await db.select()
      .from(clientNoteCategories)
      .where(eq(clientNoteCategories.tenantId, tenantId))
      .orderBy(clientNoteCategories.name);

    res.json({ ok: true, categories });
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.getCategories", req);
  }
});

router.post("/:clientId/notes/categories", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;

  if (!tenantId) {
    throw AppError.tenantRequired();
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
      return handleRouteError(res, AppError.conflict("Category with this name already exists"), "clientNotes.createCategory", req);
    }
    handleRouteError(res, error, "clientNotes.createCategory", req);
  }
});

router.put("/:clientId/notes/categories/:categoryId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { categoryId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const data = createCategorySchema.parse(req.body);

    const [existing] = await db.select()
      .from(clientNoteCategories)
      .where(and(
        eq(clientNoteCategories.id, categoryId),
        eq(clientNoteCategories.tenantId, tenantId)
      ));

    if (!existing) {
      throw AppError.notFound("Category");
    }

    if (existing.isSystem) {
      throw AppError.badRequest("Cannot edit system categories");
    }

    const [category] = await db.update(clientNoteCategories)
      .set({
        name: data.name,
        color: data.color,
      })
      .where(eq(clientNoteCategories.id, categoryId))
      .returning();

    res.json({ ok: true, category });
  } catch (error: any) {
    if (error.code === "23505") {
      return handleRouteError(res, AppError.conflict("Category with this name already exists"), "clientNotes.updateCategory", req);
    }
    handleRouteError(res, error, "clientNotes.updateCategory", req);
  }
});

router.delete("/:clientId/notes/categories/:categoryId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { categoryId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const [existing] = await db.select()
      .from(clientNoteCategories)
      .where(and(
        eq(clientNoteCategories.id, categoryId),
        eq(clientNoteCategories.tenantId, tenantId)
      ));

    if (!existing) {
      throw AppError.notFound("Category");
    }

    if (existing.isSystem) {
      throw AppError.badRequest("Cannot delete system categories");
    }

    await db.update(clientNotes)
      .set({ categoryId: null, category: "general" })
      .where(and(
        eq(clientNotes.categoryId, categoryId),
        eq(clientNotes.tenantId, tenantId)
      ));

    await db.delete(clientNoteCategories).where(and(eq(clientNoteCategories.id, categoryId), eq(clientNoteCategories.tenantId, tenantId)));

    res.json({ ok: true, message: "Category deleted successfully" });
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.deleteCategory", req);
  }
});

router.get("/:clientId/notes", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
  }

  try {
    const client = await db.select().from(clients).where(
      and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))
    ).limit(1);

    if (!client.length) {
      throw AppError.notFound("Client");
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

      const attachments = await db.select({
        id: clientNoteAttachments.id,
        noteId: clientNoteAttachments.noteId,
        tenantId: clientNoteAttachments.tenantId,
        originalFileName: clientNoteAttachments.originalFileName,
        storageKey: clientNoteAttachments.storageKey,
        mimeType: clientNoteAttachments.mimeType,
        fileSizeBytes: clientNoteAttachments.fileSizeBytes,
        createdAt: clientNoteAttachments.createdAt,
        uploadedByUserId: clientNoteAttachments.uploadedByUserId,
      })
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
    handleRouteError(res, error, "clientNotes.getNotes", req);
  }
});

router.post("/:clientId/notes", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { clientId } = req.params;

  if (!tenantId || !userId) {
    throw AppError.badRequest("Tenant and user context required");
  }

  try {
    const data = createNoteSchema.parse({ ...req.body, clientId });

    const client = await db.select().from(clients).where(
      and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))
    ).limit(1);

    if (!client.length) {
      throw AppError.notFound("Client");
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
    handleRouteError(res, error, "clientNotes.createNote", req);
  }
});

router.get("/:clientId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, noteId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
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
      throw AppError.notFound("Note");
    }

    const versions = await db.select()
      .from(clientNoteVersions)
      .where(and(
        eq(clientNoteVersions.noteId, noteId),
        eq(clientNoteVersions.tenantId, tenantId)
      ))
      .orderBy(desc(clientNoteVersions.versionNumber));

    const attachments = await db.select({
      id: clientNoteAttachments.id,
      noteId: clientNoteAttachments.noteId,
      tenantId: clientNoteAttachments.tenantId,
      originalFileName: clientNoteAttachments.originalFileName,
      storageKey: clientNoteAttachments.storageKey,
      mimeType: clientNoteAttachments.mimeType,
      fileSizeBytes: clientNoteAttachments.fileSizeBytes,
      createdAt: clientNoteAttachments.createdAt,
      uploadedByUserId: clientNoteAttachments.uploadedByUserId,
    })
      .from(clientNoteAttachments)
      .where(and(
        eq(clientNoteAttachments.noteId, noteId),
        eq(clientNoteAttachments.tenantId, tenantId)
      ));

    res.json({ ok: true, note, versions, attachments });
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.getNote", req);
  }
});

router.put("/:clientId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { clientId, noteId } = req.params;

  if (!tenantId || !userId) {
    throw AppError.badRequest("Tenant and user context required");
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
      throw AppError.notFound("Note");
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
    handleRouteError(res, error, "clientNotes.updateNote", req);
  }
});

router.delete("/:clientId/notes/:noteId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, noteId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
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
      throw AppError.notFound("Note");
    }

    await db.delete(clientNotes).where(and(eq(clientNotes.id, noteId), eq(clientNotes.tenantId, tenantId)));

    res.json({ ok: true, message: "Note deleted successfully" });
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.deleteNote", req);
  }
});

router.get("/:clientId/notes/:noteId/versions", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { noteId } = req.params;

  if (!tenantId) {
    throw AppError.tenantRequired();
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
      editorEmail: users.email,
    })
      .from(clientNoteVersions)
      .leftJoin(users, eq(clientNoteVersions.editorUserId, users.id))
      .where(and(
        eq(clientNoteVersions.noteId, noteId),
        eq(clientNoteVersions.tenantId, tenantId)
      ))
      .orderBy(desc(clientNoteVersions.versionNumber));

    const currentNote = await db.select({
      id: clientNotes.id,
      clientId: clientNotes.clientId,
      body: clientNotes.body,
      category: clientNotes.category,
      categoryId: clientNotes.categoryId,
      createdAt: clientNotes.createdAt,
      updatedAt: clientNotes.updatedAt,
      authorUserId: clientNotes.authorUserId,
      lastEditedByUserId: clientNotes.lastEditedByUserId,
    })
      .from(clientNotes)
      .where(and(eq(clientNotes.id, noteId), eq(clientNotes.tenantId, tenantId)));

    const transformedVersions = versions.map(v => ({
      id: v.id,
      noteId: v.noteId,
      body: v.body,
      category: v.category,
      categoryId: v.categoryId,
      versionNumber: v.versionNumber,
      createdAt: v.createdAt,
      editorUserId: v.editorUserId,
      editor: {
        firstName: v.editorFirstName,
        lastName: v.editorLastName,
        email: v.editorEmail,
      },
    }));

    res.json({ 
      ok: true, 
      currentNote: currentNote[0] || null,
      versions: transformedVersions,
      totalVersions: transformedVersions.length,
    });
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.getVersions", req);
  }
});

// =============================================================================
// NOTE ATTACHMENTS
// =============================================================================

router.post("/:clientId/notes/:noteId/attachments/upload", requireAuth, requireTenantContext, fileUpload.single("file"), async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { clientId, noteId } = req.params;

  if (!tenantId || !userId) {
    return res.status(400).json({ ok: false, error: "Tenant and user context required" });
  }

  try {
    if (!isS3Configured()) {
      throw new AppError(503, "INTERNAL_ERROR", "File storage is not configured.");
    }

    const file = (req as any).file;
    if (!file) {
      throw AppError.badRequest("No file provided");
    }

    const [existingNote] = await db.select()
      .from(clientNotes)
      .where(and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ));

    if (!existingNote) {
      throw AppError.notFound("Note");
    }

    const mimeType = file.mimetype || "application/octet-stream";
    const fileName = file.originalname || "untitled";
    const fileSizeBytes = file.size;

    const validation = validateFile(mimeType, fileSizeBytes);
    if (!validation.valid) {
      throw AppError.badRequest(validation.error || "Invalid file");
    }

    const fileId = crypto.randomUUID();
    const storageKey = `tenants/${tenantId}/clients/${clientId}/notes/${noteId}/${fileId}/${fileName}`;

    await uploadToS3(storageKey, file.buffer, mimeType);

    const [attachment] = await db.insert(clientNoteAttachments).values({
      tenantId,
      noteId,
      uploadedByUserId: userId,
      originalFileName: fileName,
      mimeType,
      fileSizeBytes,
      storageKey,
      uploadStatus: "completed",
    }).returning();

    res.status(201).json({ ok: true, attachment });
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.uploadAttachment", req);
  }
});

router.get("/:clientId/notes/:noteId/attachments/:attachmentId/download", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, noteId, attachmentId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: "Tenant context required" });
  }

  try {
    if (!isS3Configured()) {
      throw new AppError(503, "INTERNAL_ERROR", "File storage is not configured.");
    }

    const [attachment] = await db.select()
      .from(clientNoteAttachments)
      .where(and(
        eq(clientNoteAttachments.id, attachmentId),
        eq(clientNoteAttachments.noteId, noteId),
        eq(clientNoteAttachments.tenantId, tenantId)
      ));

    if (!attachment) {
      throw AppError.notFound("Attachment");
    }

    const downloadUrl = await createPresignedDownloadUrl(attachment.storageKey, tenantId);
    res.redirect(downloadUrl);
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.downloadAttachment", req);
  }
});

router.delete("/:clientId/notes/:noteId/attachments/:attachmentId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { noteId, attachmentId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: "Tenant context required" });
  }

  try {
    const [attachment] = await db.select()
      .from(clientNoteAttachments)
      .where(and(
        eq(clientNoteAttachments.id, attachmentId),
        eq(clientNoteAttachments.noteId, noteId),
        eq(clientNoteAttachments.tenantId, tenantId)
      ));

    if (!attachment) {
      throw AppError.notFound("Attachment");
    }

    await db.delete(clientNoteAttachments)
      .where(eq(clientNoteAttachments.id, attachmentId));

    res.json({ ok: true, message: "Attachment deleted" });
  } catch (error: any) {
    handleRouteError(res, error, "clientNotes.deleteAttachment", req);
  }
});

export default router;
