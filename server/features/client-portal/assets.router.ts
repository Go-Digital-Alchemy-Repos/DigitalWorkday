import crypto from "crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { AppError, handleRouteError } from "../../lib/errors";
import { assetService } from "../assetLibrary/asset.service";
import { tenantDefaultDocsRepo } from "../tenantDefaultDocs/tenantDefaultDocs.repo";
import { requireActivePortalAccess } from "../../services/portalAuthorization";
import { assetFolders, assets, UserRole } from "@shared/schema";
import { createPresignedDownloadUrl, isS3Configured, uploadToS3, validateFile } from "../../s3";
import { ALLOWED_MIME_TYPES } from "../../s3";
import { isFilenameUnsafe, sanitizeFilename } from "../../http/middleware/uploadGuards";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use((req, _res, next) => {
  if (!req.user || req.user.role !== UserRole.CLIENT) return next(AppError.forbidden("Portal access only"));
  next();
});

async function context(userId: string, clientId: string) {
  await requireActivePortalAccess(userId, clientId);
  const { storage } = await import("../../storage");
  const client = await storage.getClient(clientId);
  if (!client?.tenantId) throw AppError.notFound("Client");
  return client;
}

router.get("/clients/:clientId/assets", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    const folderId = typeof req.query.folderId === "string" ? req.query.folderId : "root";
    const result = await assetService.listAssets({
      tenantId: client.tenantId!,
      clientId: client.id,
      folderId,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      visibility: "client_visible",
      limit: 100,
    });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/assets", req);
  }
});

router.get("/clients/:clientId/assets/folders", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    const rows = await db.select().from(assetFolders).where(and(
      eq(assetFolders.tenantId, client.tenantId!),
      eq(assetFolders.clientId, client.id),
      eq(assetFolders.visibility, "client_visible"),
    )).orderBy(asc(assetFolders.sortOrder), asc(assetFolders.name));
    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/assets/folders", req);
  }
});

router.get("/clients/:clientId/assets/defaults", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    res.json(await tenantDefaultDocsRepo.getTree(client.tenantId!));
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/assets/defaults", req);
  }
});

router.get("/clients/:clientId/assets/defaults/:documentId/download", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    const document = await tenantDefaultDocsRepo.getDocumentById(req.params.documentId, client.tenantId!);
    if (!document || document.isDeleted) throw AppError.notFound("Default document");
    res.json({ url: await createPresignedDownloadUrl(document.r2Key, client.tenantId!), fileName: document.fileName });
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/assets/defaults/:documentId/download", req);
  }
});

const folderSchema = z.object({ parentFolderId: z.string().uuid().nullable().optional(), name: z.string().min(1).max(255) }).strict();

router.post("/clients/:clientId/assets/folders", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    const data = folderSchema.parse(req.body);
    if (data.parentFolderId) {
      const [parent] = await db.select().from(assetFolders).where(and(
        eq(assetFolders.id, data.parentFolderId), eq(assetFolders.clientId, client.id), eq(assetFolders.visibility, "client_visible"),
      )).limit(1);
      if (!parent) throw AppError.badRequest("Parent folder is not available in the portal");
    }
    const [folder] = await db.insert(assetFolders).values({
      tenantId: client.tenantId!, workspaceId: client.workspaceId, clientId: client.id,
      parentFolderId: data.parentFolderId || null, name: data.name, visibility: "client_visible", createdByUserId: req.user!.id,
    }).returning();
    res.status(201).json(folder);
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/assets/folders", req);
  }
});

router.patch("/clients/:clientId/assets/folders/:folderId", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    const data = folderSchema.partial().parse(req.body);
    if (data.parentFolderId === req.params.folderId) throw AppError.badRequest("A folder cannot contain itself");
    if (data.parentFolderId) {
      const [parent] = await db.select().from(assetFolders).where(and(
        eq(assetFolders.id, data.parentFolderId), eq(assetFolders.clientId, client.id), eq(assetFolders.visibility, "client_visible"),
      )).limit(1);
      if (!parent) throw AppError.badRequest("Parent folder is not available in the portal");
    }
    const [folder] = await db.update(assetFolders).set({ ...data, visibility: "client_visible", updatedAt: new Date() }).where(and(
      eq(assetFolders.id, req.params.folderId), eq(assetFolders.clientId, client.id), eq(assetFolders.visibility, "client_visible"),
    )).returning();
    if (!folder) throw AppError.notFound("Folder");
    res.json(folder);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/assets/folders/:folderId", req);
  }
});

router.post("/clients/:clientId/assets/upload", upload.single("file"), async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    if (!isS3Configured()) throw AppError.internal("File storage is not configured");
    const file = req.file;
    if (!file) throw AppError.badRequest("No file provided");
    const validation = validateFile(file.mimetype, file.size, file.originalname);
    if (!validation.valid || isFilenameUnsafe(file.originalname) || !ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      throw AppError.badRequest(validation.error || "File type is not allowed");
    }
    const folderId = req.body.folderId || null;
    if (folderId) {
      const [folder] = await db.select().from(assetFolders).where(and(
        eq(assetFolders.id, folderId), eq(assetFolders.clientId, client.id), eq(assetFolders.visibility, "client_visible"),
      )).limit(1);
      if (!folder) throw AppError.badRequest("Folder is not available in the portal");
    }
    const r2Key = `assets/${client.tenantId}/${client.id}/${crypto.randomUUID()}-${sanitizeFilename(file.originalname)}`;
    await uploadToS3(file.buffer, r2Key, file.mimetype, client.tenantId!);
    const { asset } = await assetService.createAsset({
      tenantId: client.tenantId!, workspaceId: client.workspaceId, clientId: client.id, folderId,
      title: file.originalname, description: null, mimeType: file.mimetype, sizeBytes: file.size,
      r2Key, checksum: null, sourceType: "manual", visibility: "client_visible",
      uploadedByType: "portal_user", uploadedByPortalUserId: req.user!.id,
    });
    res.status(201).json(asset);
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/assets/upload", req);
  }
});

const assetUpdateSchema = z.object({ title: z.string().min(1).max(255).optional(), description: z.string().max(5000).nullable().optional(), folderId: z.string().uuid().nullable().optional() }).strict();

router.patch("/clients/:clientId/assets/:assetId", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    const data = assetUpdateSchema.parse(req.body);
    if (data.folderId) {
      const [folder] = await db.select().from(assetFolders).where(and(eq(assetFolders.id, data.folderId), eq(assetFolders.clientId, client.id), eq(assetFolders.visibility, "client_visible"))).limit(1);
      if (!folder) throw AppError.badRequest("Folder is not available in the portal");
    }
    const [asset] = await db.update(assets).set({ ...data, updatedAt: new Date() }).where(and(
      eq(assets.id, req.params.assetId), eq(assets.clientId, client.id), eq(assets.visibility, "client_visible"), eq(assets.isDeleted, false),
    )).returning();
    if (!asset) throw AppError.notFound("Asset");
    res.json(asset);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/assets/:assetId", req);
  }
});

router.get("/clients/:clientId/assets/:assetId/download", async (req, res) => {
  try {
    const client = await context(req.user!.id, req.params.clientId);
    const [asset] = await db.select().from(assets).where(and(
      eq(assets.id, req.params.assetId), eq(assets.clientId, client.id), eq(assets.visibility, "client_visible"), eq(assets.isDeleted, false),
    )).limit(1);
    if (!asset) throw AppError.notFound("Asset");
    res.json({ url: await createPresignedDownloadUrl(asset.r2Key, client.tenantId!) });
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/assets/:assetId/download", req);
  }
});

export default router;
