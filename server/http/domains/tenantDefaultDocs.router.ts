import crypto from "crypto";
import { z } from "zod";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { createApiRouter } from "../routerFactory";
import { tenantDefaultDocsRepo } from "../../features/tenantDefaultDocs/tenantDefaultDocs.repo";
import { AppError, handleRouteError } from "../../lib/errors";
import { getCurrentUserId } from "../../routes/helpers";
import {
  isS3Configured,
  uploadToS3,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
} from "../../s3";
import { sanitizeFilename, isFilenameUnsafe } from "../middleware/uploadGuards";
import { config } from "../../config";
import { UserRole } from "@shared/schema";

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

function requireAdminOrSuper(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user) return res.status(401).json({ error: "Authentication required" });
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function validateTenantAccess(req: Request, tenantId: string): boolean {
  const user = req.user as any;
  if (user.role === UserRole.SUPER_USER) return true;
  if (user.role === UserRole.ADMIN && user.tenantId === tenantId) return true;
  return false;
}

function getEffectiveTenantId(req: Request): string | null {
  const user = req.user as any;
  return user?.tenantId || (req as any).tenant?.effectiveTenantId || null;
}

function generateDocStorageKey(tenantId: string, fileName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const uuid = crypto.randomUUID();
  const safe = sanitizeFilename(fileName);
  return `tenants/${tenantId}/default-docs/${year}/${month}/${uuid}-${safe}`;
}

router.get("/tenants/:tenantId/default-docs/tree", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    const tree = await tenantDefaultDocsRepo.getTree(tenantId);
    res.json(tree);
  } catch (error) {
    return handleRouteError(res, error, "GET /tenants/:tenantId/default-docs/tree", req);
  }
});

router.get("/tenants/:tenantId/default-docs/client-view", async (req: Request, res: Response) => {
  try {
    const effectiveTenantId = getEffectiveTenantId(req);
    const { tenantId } = req.params;
    const user = req.user as any;

    if (user.role === UserRole.SUPER_USER || user.role === UserRole.CLIENT || user.role === UserRole.ADMIN || effectiveTenantId === tenantId) {
      const tree = await tenantDefaultDocsRepo.getTree(tenantId);
      res.json(tree);
    } else {
      return res.status(403).json({ error: "Access denied" });
    }
  } catch (error) {
    return handleRouteError(res, error, "GET /tenants/:tenantId/default-docs/client-view", req);
  }
});

const createFolderSchema = z.object({
  parentFolderId: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  sortOrder: z.number().int().optional(),
});

router.post("/tenants/:tenantId/default-docs/folders", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    const data = createFolderSchema.parse(req.body);
    const userId = getCurrentUserId(req);
    const folder = await tenantDefaultDocsRepo.createFolder({
      tenantId,
      parentFolderId: data.parentFolderId,
      name: data.name,
      sortOrder: data.sortOrder,
      createdByUserId: userId,
    });
    res.status(201).json(folder);
  } catch (error) {
    return handleRouteError(res, error, "POST /tenants/:tenantId/default-docs/folders", req);
  }
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentFolderId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

router.patch("/tenants/:tenantId/default-docs/folders/:folderId", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId, folderId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    const data = updateFolderSchema.parse(req.body);
    const userId = getCurrentUserId(req);
    const folder = await tenantDefaultDocsRepo.updateFolder(folderId, tenantId, data, userId);
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /tenants/:tenantId/default-docs/folders/:folderId", req);
  }
});

router.delete("/tenants/:tenantId/default-docs/folders/:folderId", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId, folderId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    const folder = await tenantDefaultDocsRepo.softDeleteFolder(folderId, tenantId);
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /tenants/:tenantId/default-docs/folders/:folderId", req);
  }
});

const presignSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
});

router.post("/tenants/:tenantId/default-docs/documents/upload/presign", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    if (!isS3Configured()) {
      return res.status(503).json({ error: "File storage not configured" });
    }
    const data = presignSchema.parse(req.body);
    if (isFilenameUnsafe(data.fileName)) {
      return res.status(400).json({ error: "Unsafe filename" });
    }
    const storageKey = generateDocStorageKey(tenantId, data.fileName);
    const presigned = await createPresignedUploadUrl(storageKey, data.mimeType, tenantId);
    res.json({ ...presigned, storageKey });
  } catch (error) {
    return handleRouteError(res, error, "POST presign", req);
  }
});

const completeUploadSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  effectiveYear: z.number().int().nullable().optional(),
});

router.post("/tenants/:tenantId/default-docs/documents/upload/complete", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    const data = completeUploadSchema.parse(req.body);
    const userId = getCurrentUserId(req);
    const doc = await tenantDefaultDocsRepo.createDocument({
      tenantId,
      folderId: data.folderId,
      title: data.title,
      description: data.description,
      r2Key: data.storageKey,
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      effectiveYear: data.effectiveYear,
      createdByUserId: userId,
    });
    res.status(201).json(doc);
  } catch (error) {
    return handleRouteError(res, error, "POST complete upload", req);
  }
});

router.post("/tenants/:tenantId/default-docs/documents/upload/proxy", requireAdminOrSuper, docUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    if (!isS3Configured()) {
      return res.status(503).json({ error: "File storage not configured" });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });
    if (isFilenameUnsafe(file.originalname)) {
      return res.status(400).json({ error: "Unsafe filename" });
    }

    const storageKey = generateDocStorageKey(tenantId, file.originalname);
    await uploadToS3(file.buffer, storageKey, file.mimetype, tenantId);

    const title = req.body.title || file.originalname;
    const folderId = req.body.folderId || null;
    const description = req.body.description || null;
    const effectiveYear = req.body.effectiveYear ? parseInt(req.body.effectiveYear) : null;
    const userId = getCurrentUserId(req);

    const doc = await tenantDefaultDocsRepo.createDocument({
      tenantId,
      folderId,
      title,
      description,
      r2Key: storageKey,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      effectiveYear,
      createdByUserId: userId,
    });
    res.status(201).json(doc);
  } catch (error) {
    return handleRouteError(res, error, "POST proxy upload", req);
  }
});

const updateDocSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  effectiveYear: z.number().int().nullable().optional(),
});

router.patch("/tenants/:tenantId/default-docs/documents/:documentId", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId, documentId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    const data = updateDocSchema.parse(req.body);
    const userId = getCurrentUserId(req);
    const doc = await tenantDefaultDocsRepo.updateDocument(documentId, tenantId, data, userId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json(doc);
  } catch (error) {
    return handleRouteError(res, error, "PATCH document", req);
  }
});

router.post("/tenants/:tenantId/default-docs/documents/:documentId/replace", requireAdminOrSuper, docUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const { tenantId, documentId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    if (!isS3Configured()) {
      return res.status(503).json({ error: "File storage not configured" });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });
    if (isFilenameUnsafe(file.originalname)) {
      return res.status(400).json({ error: "Unsafe filename" });
    }

    const existing = await tenantDefaultDocsRepo.getDocumentById(documentId, tenantId);
    if (!existing) return res.status(404).json({ error: "Document not found" });

    const storageKey = generateDocStorageKey(tenantId, file.originalname);
    await uploadToS3(file.buffer, storageKey, file.mimetype, tenantId);

    const userId = getCurrentUserId(req);
    const doc = await tenantDefaultDocsRepo.replaceDocumentFile(documentId, tenantId, {
      r2Key: storageKey,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
    }, userId);
    res.json(doc);
  } catch (error) {
    return handleRouteError(res, error, "POST replace document file", req);
  }
});

router.delete("/tenants/:tenantId/default-docs/documents/:documentId", requireAdminOrSuper, async (req: Request, res: Response) => {
  try {
    const { tenantId, documentId } = req.params;
    if (!validateTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    const userId = getCurrentUserId(req);
    const doc = await tenantDefaultDocsRepo.softDeleteDocument(documentId, tenantId, userId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE document", req);
  }
});

router.get("/tenants/:tenantId/default-docs/documents/:documentId/download", async (req: Request, res: Response) => {
  try {
    const { tenantId, documentId } = req.params;
    const effectiveTenantId = getEffectiveTenantId(req);
    const user = req.user as any;
    if (user.role !== UserRole.SUPER_USER && effectiveTenantId !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!isS3Configured()) {
      return res.status(503).json({ error: "File storage not configured" });
    }
    const doc = await tenantDefaultDocsRepo.getDocumentById(documentId, tenantId);
    if (!doc || doc.isDeleted) return res.status(404).json({ error: "Document not found" });
    const url = await createPresignedDownloadUrl(doc.r2Key, tenantId);
    res.json({ url, fileName: doc.fileName, mimeType: doc.mimeType });
  } catch (error) {
    return handleRouteError(res, error, "GET download document", req);
  }
});

export default router;
