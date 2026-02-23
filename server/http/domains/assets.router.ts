import crypto from "crypto";
import { z } from "zod";
import multer from "multer";
import { createApiRouter } from "../routerFactory";
import { assetService } from "../../features/assetLibrary/asset.service";
import { AppError, handleRouteError } from "../../lib/errors";
import { getCurrentUserId } from "../../routes/helpers";
import {
  isS3Configured,
  validateFile,
  uploadToS3,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  ALLOWED_MIME_TYPES,
} from "../../s3";
import { validateUploadRequest, sanitizeFilename, isFilenameUnsafe } from "../middleware/uploadGuards";
import { storage } from "../../storage";
import type { Request, Response } from "express";
import { ASSET_SOURCE_TYPES, ASSET_VISIBILITY } from "@shared/schema";

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

function getEffectiveTenantId(req: Request): string | null {
  const user = req.user as any;
  return user?.tenantId || (req as any).tenant?.effectiveTenantId || null;
}

async function validateClientBelongsToTenant(clientId: string, tenantId: string) {
  const client = await storage.getClient(clientId);
  if (!client || client.tenantId !== tenantId) {
    throw AppError.notFound("Client");
  }
  return client;
}

// ============================================================================
// FOLDERS (must be defined before /assets/:assetId to avoid route shadowing)
// ============================================================================

router.get("/assets/folders", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const clientId = req.query.clientId as string;
    if (!clientId) return res.status(400).json({ error: "clientId is required" });

    await validateClientBelongsToTenant(clientId, tenantId);
    const folders = await assetService.listFolders(tenantId, clientId);
    res.json(folders);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/assets/folders", req);
  }
});

const createFolderSchema = z.object({
  clientId: z.string().min(1),
  parentFolderId: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
});

router.post("/assets/folders", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const data = createFolderSchema.parse(req.body);
    await validateClientBelongsToTenant(data.clientId, tenantId);

    const folder = await assetService.createFolder({
      tenantId,
      clientId: data.clientId,
      parentFolderId: data.parentFolderId || null,
      name: data.name,
      createdByUserId: getCurrentUserId(req),
    });

    res.status(201).json(folder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return handleRouteError(res, error, "POST /api/v1/assets/folders", req);
  }
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentFolderId: z.string().nullable().optional(),
});

router.patch("/assets/folders/:folderId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const data = updateFolderSchema.parse(req.body);
    let folder;

    if (data.name !== undefined) {
      folder = await assetService.renameFolder(tenantId, req.params.folderId, data.name);
    }
    if (data.parentFolderId !== undefined) {
      folder = await assetService.moveFolder(tenantId, req.params.folderId, data.parentFolderId);
    }

    if (!folder) {
      folder = await assetService.listFolders(tenantId, "").then(() => null);
      return res.status(400).json({ error: "No update fields provided" });
    }

    res.json(folder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return handleRouteError(res, error, "PATCH /api/v1/assets/folders/:folderId", req);
  }
});

const reorderFoldersSchema = z.object({
  updates: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int().min(0),
  })).min(1),
});

router.put("/assets/folders/reorder", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const { updates } = reorderFoldersSchema.parse(req.body);
    await assetService.reorderFolders(tenantId, updates);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return handleRouteError(res, error, "PUT /api/v1/assets/folders/reorder", req);
  }
});

router.delete("/assets/folders/:folderId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    await assetService.deleteFolder(tenantId, req.params.folderId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/assets/folders/:folderId", req);
  }
});

// ============================================================================
// ASSETS
// ============================================================================

const listAssetsSchema = z.object({
  clientId: z.string().min(1),
  folderId: z.string().optional(),
  q: z.string().optional(),
  sourceType: z.enum(ASSET_SOURCE_TYPES).optional(),
  visibility: z.enum(ASSET_VISIBILITY).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

router.get("/assets", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const filters = listAssetsSchema.parse(req.query);
    await validateClientBelongsToTenant(filters.clientId, tenantId);

    const result = await assetService.listAssets({
      tenantId,
      clientId: filters.clientId,
      folderId: filters.folderId,
      q: filters.q,
      sourceType: filters.sourceType,
      visibility: filters.visibility,
      cursor: filters.cursor,
      limit: filters.limit,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return handleRouteError(res, error, "GET /api/v1/assets", req);
  }
});

router.get("/assets/:assetId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const asset = await assetService.getAsset(tenantId, req.params.assetId);
    if (!asset) return res.status(404).json({ error: "Asset not found" });

    res.json(asset);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/assets/:assetId", req);
  }
});

const updateAssetSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  visibility: z.enum(ASSET_VISIBILITY).optional(),
});

router.patch("/assets/:assetId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const updates = updateAssetSchema.parse(req.body);
    const asset = await assetService.updateAssetMeta(tenantId, req.params.assetId, updates);
    res.json(asset);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return handleRouteError(res, error, "PATCH /api/v1/assets/:assetId", req);
  }
});

router.delete("/assets/:assetId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    await assetService.deleteAsset(tenantId, req.params.assetId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/assets/:assetId", req);
  }
});

// ============================================================================
// UPLOAD (Manual uploads via Asset Library)
// ============================================================================

const presignSchema = z.object({
  clientId: z.string().min(1),
  folderId: z.string().nullable().optional(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().positive(),
});

router.post(
  "/assets/upload/presign",
  validateUploadRequest({
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    filenameField: "filename",
    sizeField: "sizeBytes",
  }),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

      if (!isS3Configured()) {
        return res.status(503).json({ error: "File storage is not configured" });
      }

      const data = presignSchema.parse(req.body);
      await validateClientBelongsToTenant(data.clientId, tenantId);

      const validation = validateFile(data.mimeType, data.sizeBytes, data.filename);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      if (isFilenameUnsafe(data.filename)) {
        return res.status(400).json({ error: "File type not allowed for security reasons" });
      }

      const safeFilename = sanitizeFilename(data.filename);
      const tempId = crypto.randomUUID();
      const r2Key = `assets/${tenantId}/${data.clientId}/${tempId}-${safeFilename}`;

      const upload = await createPresignedUploadUrl(r2Key, data.mimeType, tenantId);

      res.status(200).json({
        r2Key,
        upload,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return handleRouteError(res, error, "POST /api/v1/assets/upload/presign", req);
    }
  }
);

const completeSchema = z.object({
  clientId: z.string().min(1),
  folderId: z.string().nullable().optional(),
  r2Key: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().positive(),
  checksum: z.string().optional(),
});

router.post("/assets/upload/complete", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const data = completeSchema.parse(req.body);
    await validateClientBelongsToTenant(data.clientId, tenantId);

    const userId = getCurrentUserId(req);

    const { asset, dedupe } = await assetService.createAsset({
      tenantId,
      clientId: data.clientId,
      folderId: data.folderId || null,
      title: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      r2Key: data.r2Key,
      checksum: data.checksum || null,
      sourceType: "manual",
      visibility: "internal",
      uploadedByType: "tenant_user",
      uploadedByUserId: userId,
    });

    res.status(201).json({ asset, dedupe });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return handleRouteError(res, error, "POST /api/v1/assets/upload/complete", req);
  }
});

// Server-proxied upload (avoids CORS issues with direct R2 uploads)
router.post(
  "/assets/upload/proxy",
  assetUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

      if (!isS3Configured()) {
        return res.status(503).json({ error: "File storage is not configured" });
      }

      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file provided" });

      const clientId = req.body.clientId;
      const folderId = req.body.folderId || null;
      if (!clientId) return res.status(400).json({ error: "clientId is required" });

      await validateClientBelongsToTenant(clientId, tenantId);

      const mimeType = file.mimetype || "application/octet-stream";
      const validation = validateFile(mimeType, file.size, file.originalname);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      if (isFilenameUnsafe(file.originalname)) {
        return res.status(400).json({ error: "File type not allowed for security reasons" });
      }

      const safeFilename = sanitizeFilename(file.originalname);
      const tempId = crypto.randomUUID();
      const r2Key = `assets/${tenantId}/${clientId}/${tempId}-${safeFilename}`;

      await uploadToS3(file.buffer, r2Key, mimeType, tenantId);

      const userId = getCurrentUserId(req);

      const { asset, dedupe } = await assetService.createAsset({
        tenantId,
        clientId,
        folderId: folderId === "null" ? null : folderId,
        title: file.originalname,
        mimeType,
        sizeBytes: file.size,
        r2Key,
        checksum: null,
        sourceType: "manual",
        visibility: "internal",
        uploadedByType: "tenant_user",
        uploadedByUserId: userId,
      });

      res.status(201).json({ asset, dedupe });
    } catch (error) {
      return handleRouteError(res, error, "POST /api/v1/assets/upload/proxy", req);
    }
  }
);

router.get("/assets/:assetId/download", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const asset = await assetService.getAsset(tenantId, req.params.assetId);
    if (!asset) return res.status(404).json({ error: "Asset not found" });

    const downloadUrl = await createPresignedDownloadUrl(asset.r2Key, tenantId);
    res.json({ url: downloadUrl });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/assets/:assetId/download", req);
  }
});

export default router;
