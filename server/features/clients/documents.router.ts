import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import { 
  clientDocuments, 
  clientDocumentCategories,
  users,
  clients 
} from "@shared/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { requireTenantContext, TenantRequest } from "../../middleware/tenantContext";
import { createPresignedUploadUrl, createPresignedDownloadUrl, deleteS3Object } from "../../s3";

const router = Router();

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
});

const initiateUploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().positive(),
  categoryId: z.string().uuid().optional().nullable(),
  displayName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const updateDocumentSchema = z.object({
  displayName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});

router.get("/:clientId/documents/categories", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const categories = await db.select()
      .from(clientDocumentCategories)
      .where(and(
        eq(clientDocumentCategories.tenantId, tenantId),
        eq(clientDocumentCategories.clientId, clientId)
      ))
      .orderBy(clientDocumentCategories.sortOrder, clientDocumentCategories.name);

    res.json({ ok: true, categories });
  } catch (error: any) {
    console.error("[client-documents] Error fetching categories:", error);
    res.status(500).json({ ok: false, error: { code: "FETCH_FAILED", message: "Failed to fetch categories" } });
  }
});

router.post("/:clientId/documents/categories", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const data = createCategorySchema.parse(req.body);

    const client = await db.select().from(clients).where(
      and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))
    ).limit(1);

    if (!client.length) {
      return res.status(404).json({ ok: false, error: { code: "CLIENT_NOT_FOUND", message: "Client not found" } });
    }

    const [category] = await db.insert(clientDocumentCategories)
      .values({
        tenantId,
        clientId,
        name: data.name,
        description: data.description,
        color: data.color,
      })
      .returning();

    res.json({ ok: true, category });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(400).json({ ok: false, error: { code: "DUPLICATE_CATEGORY", message: "Category with this name already exists for this client" } });
    }
    console.error("[client-documents] Error creating category:", error);
    res.status(500).json({ ok: false, error: { code: "CREATE_FAILED", message: "Failed to create category" } });
  }
});

router.patch("/:clientId/documents/categories/:categoryId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, categoryId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const data = updateCategorySchema.parse(req.body);

    const [category] = await db.update(clientDocumentCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(clientDocumentCategories.id, categoryId),
        eq(clientDocumentCategories.clientId, clientId),
        eq(clientDocumentCategories.tenantId, tenantId)
      ))
      .returning();

    if (!category) {
      return res.status(404).json({ ok: false, error: { code: "CATEGORY_NOT_FOUND", message: "Category not found" } });
    }

    res.json({ ok: true, category });
  } catch (error: any) {
    console.error("[client-documents] Error updating category:", error);
    res.status(500).json({ ok: false, error: { code: "UPDATE_FAILED", message: "Failed to update category" } });
  }
});

router.delete("/:clientId/documents/categories/:categoryId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, categoryId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    await db.update(clientDocuments)
      .set({ categoryId: null })
      .where(and(
        eq(clientDocuments.categoryId, categoryId),
        eq(clientDocuments.clientId, clientId),
        eq(clientDocuments.tenantId, tenantId)
      ));

    await db.delete(clientDocumentCategories)
      .where(and(
        eq(clientDocumentCategories.id, categoryId),
        eq(clientDocumentCategories.clientId, clientId),
        eq(clientDocumentCategories.tenantId, tenantId)
      ));

    res.json({ ok: true, message: "Category deleted successfully" });
  } catch (error: any) {
    console.error("[client-documents] Error deleting category:", error);
    res.status(500).json({ ok: false, error: { code: "DELETE_FAILED", message: "Failed to delete category" } });
  }
});

router.get("/:clientId/documents", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId } = req.params;
  const { categoryId } = req.query;

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

    let query = db.select({
      id: clientDocuments.id,
      clientId: clientDocuments.clientId,
      categoryId: clientDocuments.categoryId,
      originalFileName: clientDocuments.originalFileName,
      displayName: clientDocuments.displayName,
      description: clientDocuments.description,
      mimeType: clientDocuments.mimeType,
      fileSizeBytes: clientDocuments.fileSizeBytes,
      storageKey: clientDocuments.storageKey,
      uploadStatus: clientDocuments.uploadStatus,
      isClientUploaded: clientDocuments.isClientUploaded,
      createdAt: clientDocuments.createdAt,
      updatedAt: clientDocuments.updatedAt,
      uploadedByUserId: clientDocuments.uploadedByUserId,
      uploaderFirstName: users.firstName,
      uploaderLastName: users.lastName,
      uploaderEmail: users.email,
    })
      .from(clientDocuments)
      .leftJoin(users, eq(clientDocuments.uploadedByUserId, users.id))
      .where(and(
        eq(clientDocuments.clientId, clientId),
        eq(clientDocuments.tenantId, tenantId),
        eq(clientDocuments.uploadStatus, "complete")
      ))
      .orderBy(desc(clientDocuments.createdAt));

    const documents = await query;

    const documentsWithUrls = await Promise.all(documents.map(async (doc) => {
      let downloadUrl = null;
      try {
        downloadUrl = await createPresignedDownloadUrl(doc.storageKey);
      } catch (e) {
        console.warn("[client-documents] Failed to get presigned URL:", e);
      }

      return {
        ...doc,
        downloadUrl,
        uploader: {
          firstName: doc.uploaderFirstName,
          lastName: doc.uploaderLastName,
          email: doc.uploaderEmail,
        },
      };
    }));

    res.json({ ok: true, documents: documentsWithUrls });
  } catch (error: any) {
    console.error("[client-documents] Error fetching documents:", error);
    res.status(500).json({ ok: false, error: { code: "FETCH_FAILED", message: "Failed to fetch documents" } });
  }
});

router.post("/:clientId/documents/upload", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const userId = (req.user as any)?.id;
  const { clientId } = req.params;

  if (!tenantId || !userId) {
    return res.status(400).json({ ok: false, error: { code: "CONTEXT_REQUIRED", message: "Tenant and user context required" } });
  }

  try {
    const data = initiateUploadSchema.parse(req.body);

    const client = await db.select().from(clients).where(
      and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))
    ).limit(1);

    if (!client.length) {
      return res.status(404).json({ ok: false, error: { code: "CLIENT_NOT_FOUND", message: "Client not found" } });
    }

    const timestamp = Date.now();
    const safeFileName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `tenants/${tenantId}/clients/${clientId}/documents/${timestamp}-${safeFileName}`;

    const [document] = await db.insert(clientDocuments)
      .values({
        tenantId,
        clientId,
        categoryId: data.categoryId,
        uploadedByUserId: userId,
        originalFileName: data.fileName,
        displayName: data.displayName || data.fileName,
        description: data.description,
        mimeType: data.mimeType,
        fileSizeBytes: data.fileSizeBytes,
        storageKey,
        uploadStatus: "pending",
        isClientUploaded: false,
      })
      .returning();

    const presigned = await createPresignedUploadUrl(storageKey, data.mimeType);

    res.json({
      ok: true,
      document,
      uploadUrl: presigned.url,
      storageKey,
    });
  } catch (error: any) {
    console.error("[client-documents] Error initiating upload:", error);
    res.status(500).json({ ok: false, error: { code: "UPLOAD_INIT_FAILED", message: "Failed to initiate upload" } });
  }
});

router.post("/:clientId/documents/:documentId/complete", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, documentId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const [document] = await db.update(clientDocuments)
      .set({ uploadStatus: "complete", updatedAt: new Date() })
      .where(and(
        eq(clientDocuments.id, documentId),
        eq(clientDocuments.clientId, clientId),
        eq(clientDocuments.tenantId, tenantId)
      ))
      .returning();

    if (!document) {
      return res.status(404).json({ ok: false, error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found" } });
    }

    res.json({ ok: true, document });
  } catch (error: any) {
    console.error("[client-documents] Error completing upload:", error);
    res.status(500).json({ ok: false, error: { code: "COMPLETE_FAILED", message: "Failed to complete upload" } });
  }
});

router.patch("/:clientId/documents/:documentId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, documentId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const data = updateDocumentSchema.parse(req.body);

    const [document] = await db.update(clientDocuments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(clientDocuments.id, documentId),
        eq(clientDocuments.clientId, clientId),
        eq(clientDocuments.tenantId, tenantId)
      ))
      .returning();

    if (!document) {
      return res.status(404).json({ ok: false, error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found" } });
    }

    res.json({ ok: true, document });
  } catch (error: any) {
    console.error("[client-documents] Error updating document:", error);
    res.status(500).json({ ok: false, error: { code: "UPDATE_FAILED", message: "Failed to update document" } });
  }
});

router.delete("/:clientId/documents/:documentId", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, documentId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const [document] = await db.select()
      .from(clientDocuments)
      .where(and(
        eq(clientDocuments.id, documentId),
        eq(clientDocuments.clientId, clientId),
        eq(clientDocuments.tenantId, tenantId)
      ));

    if (!document) {
      return res.status(404).json({ ok: false, error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found" } });
    }

    try {
      await deleteS3Object(document.storageKey);
    } catch (e) {
      console.warn("[client-documents] Failed to delete S3 object:", e);
    }

    await db.delete(clientDocuments).where(eq(clientDocuments.id, documentId));

    res.json({ ok: true, message: "Document deleted successfully" });
  } catch (error: any) {
    console.error("[client-documents] Error deleting document:", error);
    res.status(500).json({ ok: false, error: { code: "DELETE_FAILED", message: "Failed to delete document" } });
  }
});

router.get("/:clientId/documents/:documentId/download", requireAuth, requireTenantContext, async (req: Request, res: Response) => {
  const tenantReq = req as TenantRequest;
  const tenantId = tenantReq.tenant?.effectiveTenantId;
  const { clientId, documentId } = req.params;

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required" } });
  }

  try {
    const [document] = await db.select()
      .from(clientDocuments)
      .where(and(
        eq(clientDocuments.id, documentId),
        eq(clientDocuments.clientId, clientId),
        eq(clientDocuments.tenantId, tenantId)
      ));

    if (!document) {
      return res.status(404).json({ ok: false, error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found" } });
    }

    const downloadUrl = await createPresignedDownloadUrl(document.storageKey);

    res.json({ ok: true, downloadUrl, fileName: document.originalFileName });
  } catch (error: any) {
    console.error("[client-documents] Error getting download URL:", error);
    res.status(500).json({ ok: false, error: { code: "DOWNLOAD_FAILED", message: "Failed to get download URL" } });
  }
});

export default router;
