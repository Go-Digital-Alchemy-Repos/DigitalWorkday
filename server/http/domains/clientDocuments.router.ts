import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import {
  clientDocuments,
  clientDocumentFolders,
  clients,
  users,
} from "@shared/schema";
import { eq, and, desc, asc, ilike, isNull, sql, inArray, count } from "drizzle-orm";
import { createApiRouter } from "../routerFactory";
import {
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  deleteS3Object,
  validateFile,
} from "../../s3";
import { AppError, handleRouteError, sendError } from "../../lib/errors";
import { sanitizeFilename, isFilenameUnsafe } from "../middleware/uploadGuards";
import { config } from "../../config";
import { documentsAssetAdapter } from "../../features/documents/documentsAssetAdapter";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

function useAssetAdapter(): boolean {
  return config.features.documentsUsingAssets === true;
}

function getTenantId(req: Request): string {
  const tenantId = (req as any).tenant?.effectiveTenantId || (req.user as any)?.tenantId;
  if (!tenantId) throw AppError.tenantRequired();
  return tenantId;
}

function getUserId(req: Request): string {
  const userId = (req.user as any)?.id;
  if (!userId) throw AppError.unauthorized();
  return userId;
}

async function verifyClientAccess(clientId: string, tenantId: string) {
  const [client] = await db.select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  if (!client) throw AppError.notFound("Client");
  return client;
}

async function verifyFolderAccess(folderId: string, clientId: string, tenantId: string) {
  const [folder] = await db.select()
    .from(clientDocumentFolders)
    .where(and(
      eq(clientDocumentFolders.id, folderId),
      eq(clientDocumentFolders.clientId, clientId),
      eq(clientDocumentFolders.tenantId, tenantId)
    ))
    .limit(1);
  if (!folder) throw AppError.notFound("Folder");
  return folder;
}

async function isDescendantOf(folderId: string, ancestorId: string, clientId: string, tenantId: string): Promise<boolean> {
  let currentId: string | null = folderId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === ancestorId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    const [folder] = await db.select({ parentFolderId: clientDocumentFolders.parentFolderId })
      .from(clientDocumentFolders)
      .where(and(
        eq(clientDocumentFolders.id, currentId),
        eq(clientDocumentFolders.clientId, clientId),
        eq(clientDocumentFolders.tenantId, tenantId)
      ))
      .limit(1);
    currentId = folder?.parentFolderId || null;
  }
  return false;
}

const createFolderSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  parentFolderId: z.string().uuid().nullable().optional(),
});

const renameFolderSchema = z.object({
  name: z.string().min(1).max(255).trim(),
});

const moveFolderSchema = z.object({
  parentFolderId: z.string().uuid().nullable(),
});

const presignSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

const completeSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  r2Key: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().optional(),
  displayName: z.string().optional(),
});

const renameFileSchema = z.object({
  displayName: z.string().min(1).max(255).trim(),
});

const moveFileSchema = z.object({
  folderId: z.string().uuid().nullable(),
});

const bulkMoveSchema = z.object({
  fileIds: z.array(z.string().uuid()).optional().default([]),
  folderIds: z.array(z.string().uuid()).optional().default([]),
  destinationFolderId: z.string().uuid().nullable(),
});

const bulkDeleteSchema = z.object({
  fileIds: z.array(z.string().uuid()).optional().default([]),
  folderIds: z.array(z.string().uuid()).optional().default([]),
});

router.get(
  "/clients/:clientId/documents/folders/tree",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.getFolderTree(tenantId, clientId);
        return res.json(result);
      }

      const folders = await db.select()
        .from(clientDocumentFolders)
        .where(and(
          eq(clientDocumentFolders.clientId, clientId),
          eq(clientDocumentFolders.tenantId, tenantId)
        ))
        .orderBy(asc(clientDocumentFolders.name));

      const fileCounts = await db.select({
        folderId: clientDocuments.folderId,
        count: count(),
      })
        .from(clientDocuments)
        .where(and(
          eq(clientDocuments.clientId, clientId),
          eq(clientDocuments.tenantId, tenantId),
          eq(clientDocuments.uploadStatus, "complete")
        ))
        .groupBy(clientDocuments.folderId);

      const countMap = new Map<string | null, number>();
      for (const row of fileCounts) {
        countMap.set(row.folderId, Number(row.count));
      }

      const foldersWithCounts = folders.map(f => ({
        ...f,
        fileCount: countMap.get(f.id) || 0,
      }));

      res.json({ ok: true, folders: foldersWithCounts, rootFileCount: countMap.get(null) || 0 });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.getFolderTree", req);
    }
  }
);

router.post(
  "/clients/:clientId/documents/folders",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { clientId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = createFolderSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.createFolder(tenantId, clientId, userId, data.name, data.parentFolderId || null);
        return res.status(201).json(result);
      }

      if (data.parentFolderId) {
        await verifyFolderAccess(data.parentFolderId, clientId, tenantId);
      }

      const [folder] = await db.insert(clientDocumentFolders)
        .values({
          tenantId,
          clientId,
          name: data.name,
          parentFolderId: data.parentFolderId || null,
          createdByUserId: userId,
        })
        .returning();

      res.status(201).json({ ok: true, folder });
    } catch (error: any) {
      if (error?.code === "23505") {
        return sendError(res, AppError.conflict("A folder with this name already exists in this location"), req);
      }
      handleRouteError(res, error, "clientDocuments.createFolder", req);
    }
  }
);

router.patch(
  "/clients/:clientId/documents/folders/:folderId",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, folderId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = renameFolderSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.renameFolder(tenantId, folderId, clientId, data.name);
        return res.json(result);
      }

      const [folder] = await db.update(clientDocumentFolders)
        .set({ name: data.name, updatedAt: new Date() })
        .where(and(
          eq(clientDocumentFolders.id, folderId),
          eq(clientDocumentFolders.clientId, clientId),
          eq(clientDocumentFolders.tenantId, tenantId)
        ))
        .returning();

      if (!folder) throw AppError.notFound("Folder");
      res.json({ ok: true, folder });
    } catch (error: any) {
      if (error?.code === "23505") {
        return sendError(res, AppError.conflict("A folder with this name already exists in this location"), req);
      }
      handleRouteError(res, error, "clientDocuments.renameFolder", req);
    }
  }
);

router.patch(
  "/clients/:clientId/documents/folders/:folderId/move",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, folderId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = moveFolderSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.moveFolder(tenantId, folderId, clientId, data.parentFolderId);
        return res.json(result);
      }

      await verifyFolderAccess(folderId, clientId, tenantId);

      if (data.parentFolderId === folderId) {
        return sendError(res, AppError.badRequest("Cannot move a folder into itself"), req);
      }

      if (data.parentFolderId) {
        await verifyFolderAccess(data.parentFolderId, clientId, tenantId);
        const isCycle = await isDescendantOf(data.parentFolderId, folderId, clientId, tenantId);
        if (isCycle) {
          return sendError(res, AppError.badRequest("Cannot move a folder into one of its subfolders"), req);
        }
      }

      const [folder] = await db.update(clientDocumentFolders)
        .set({ parentFolderId: data.parentFolderId, updatedAt: new Date() })
        .where(and(
          eq(clientDocumentFolders.id, folderId),
          eq(clientDocumentFolders.clientId, clientId),
          eq(clientDocumentFolders.tenantId, tenantId)
        ))
        .returning();

      if (!folder) throw AppError.notFound("Folder");
      res.json({ ok: true, folder });
    } catch (error: any) {
      if (error?.code === "23505") {
        return sendError(res, AppError.conflict("A folder with this name already exists in the destination"), req);
      }
      handleRouteError(res, error, "clientDocuments.moveFolder", req);
    }
  }
);

router.delete(
  "/clients/:clientId/documents/folders/:folderId",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, folderId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.deleteFolder(tenantId, folderId, clientId);
        return res.json(result);
      }

      await verifyFolderAccess(folderId, clientId, tenantId);

      const [childFolders] = await db.select({ count: count() })
        .from(clientDocumentFolders)
        .where(and(
          eq(clientDocumentFolders.parentFolderId, folderId),
          eq(clientDocumentFolders.clientId, clientId),
          eq(clientDocumentFolders.tenantId, tenantId)
        ));

      const [childFiles] = await db.select({ count: count() })
        .from(clientDocuments)
        .where(and(
          eq(clientDocuments.folderId, folderId),
          eq(clientDocuments.clientId, clientId),
          eq(clientDocuments.tenantId, tenantId)
        ));

      if (Number(childFolders?.count || 0) > 0 || Number(childFiles?.count || 0) > 0) {
        return res.status(409).json({
          ok: false,
          error: {
            code: "FOLDER_NOT_EMPTY",
            message: "Cannot delete a folder that contains files or subfolders. Move or delete them first.",
          },
        });
      }

      await db.delete(clientDocumentFolders)
        .where(and(
          eq(clientDocumentFolders.id, folderId),
          eq(clientDocumentFolders.clientId, clientId),
          eq(clientDocumentFolders.tenantId, tenantId)
        ));

      res.json({ ok: true, message: "Folder deleted" });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.deleteFolder", req);
    }
  }
);

router.get(
  "/clients/:clientId/documents/files",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId } = req.params;
      const { folderId, q, sort } = req.query;
      await verifyClientAccess(clientId, tenantId);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.listFiles(tenantId, clientId, {
          folderId: folderId as string | undefined,
          q: q as string | undefined,
          sort: sort as string | undefined,
        });
        return res.json(result);
      }

      const conditions = [
        eq(clientDocuments.clientId, clientId),
        eq(clientDocuments.tenantId, tenantId),
        eq(clientDocuments.uploadStatus, "complete"),
      ];

      if (q && typeof q === "string" && q.trim()) {
        conditions.push(ilike(clientDocuments.originalFileName, `%${q.trim()}%`));
      } else if (folderId === "null" || folderId === undefined || folderId === "") {
        conditions.push(isNull(clientDocuments.folderId));
      } else if (typeof folderId === "string") {
        conditions.push(eq(clientDocuments.folderId, folderId));
      }

      let orderBy;
      switch (sort) {
        case "name_asc": orderBy = asc(clientDocuments.originalFileName); break;
        case "name_desc": orderBy = desc(clientDocuments.originalFileName); break;
        case "size_asc": orderBy = asc(clientDocuments.fileSizeBytes); break;
        case "size_desc": orderBy = desc(clientDocuments.fileSizeBytes); break;
        case "oldest": orderBy = asc(clientDocuments.createdAt); break;
        case "newest":
        default: orderBy = desc(clientDocuments.createdAt); break;
      }

      const files = await db.select({
        id: clientDocuments.id,
        clientId: clientDocuments.clientId,
        folderId: clientDocuments.folderId,
        originalFileName: clientDocuments.originalFileName,
        displayName: clientDocuments.displayName,
        mimeType: clientDocuments.mimeType,
        fileSizeBytes: clientDocuments.fileSizeBytes,
        storageKey: clientDocuments.storageKey,
        createdAt: clientDocuments.createdAt,
        updatedAt: clientDocuments.updatedAt,
        uploadedByUserId: clientDocuments.uploadedByUserId,
        uploaderFirstName: users.firstName,
        uploaderLastName: users.lastName,
      })
        .from(clientDocuments)
        .leftJoin(users, eq(clientDocuments.uploadedByUserId, users.id))
        .where(and(...conditions))
        .orderBy(orderBy);

      res.json({ ok: true, files });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.listFiles", req);
    }
  }
);

router.post(
  "/clients/:clientId/documents/files/presign",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { clientId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = presignSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.presignUpload(tenantId, clientId, data.folderId || null, data.filename, data.mimeType, data.sizeBytes);
        return res.json(result);
      }

      const safeName = sanitizeFilename(data.filename);
      if (isFilenameUnsafe(safeName)) {
        return sendError(res, AppError.badRequest("This file type is not allowed for security reasons"), req);
      }

      const validation = validateFile(data.mimeType, data.sizeBytes, safeName);
      if (!validation.valid) {
        return sendError(res, AppError.badRequest(validation.error || "File validation failed"), req);
      }

      if (data.folderId) {
        await verifyFolderAccess(data.folderId, clientId, tenantId);
      }

      const timestamp = Date.now();
      const r2Key = `tenants/${tenantId}/clients/${clientId}/documents/${timestamp}-${sanitizeFilename(safeName)}`;

      const presigned = await createPresignedUploadUrl(r2Key, data.mimeType, tenantId);

      res.json({
        ok: true,
        uploadUrl: presigned.url,
        r2Key,
        method: presigned.method,
        headers: presigned.headers,
      });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.presign", req);
    }
  }
);

router.post(
  "/clients/:clientId/documents/files/complete",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { clientId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = completeSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.completeUpload(tenantId, clientId, userId, data);
        return res.status(201).json(result);
      }

      if (data.folderId) {
        await verifyFolderAccess(data.folderId, clientId, tenantId);
      }

      const [document] = await db.insert(clientDocuments)
        .values({
          tenantId,
          clientId,
          folderId: data.folderId || null,
          uploadedByUserId: userId,
          originalFileName: data.filename,
          displayName: data.displayName || data.filename,
          mimeType: data.mimeType,
          fileSizeBytes: data.sizeBytes,
          storageKey: data.r2Key,
          uploadStatus: "complete",
          isClientUploaded: false,
        })
        .returning();

      res.status(201).json({ ok: true, document });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.complete", req);
    }
  }
);

router.patch(
  "/clients/:clientId/documents/files/:fileId/rename",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, fileId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = renameFileSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.renameFile(tenantId, fileId, clientId, data.displayName);
        return res.json(result);
      }

      const [document] = await db.update(clientDocuments)
        .set({ displayName: data.displayName, updatedAt: new Date() })
        .where(and(
          eq(clientDocuments.id, fileId),
          eq(clientDocuments.clientId, clientId),
          eq(clientDocuments.tenantId, tenantId)
        ))
        .returning();

      if (!document) throw AppError.notFound("Document");
      res.json({ ok: true, document });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.renameFile", req);
    }
  }
);

router.patch(
  "/clients/:clientId/documents/files/:fileId/move",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, fileId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = moveFileSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.moveFile(tenantId, fileId, clientId, data.folderId);
        return res.json(result);
      }

      if (data.folderId) {
        await verifyFolderAccess(data.folderId, clientId, tenantId);
      }

      const [document] = await db.update(clientDocuments)
        .set({ folderId: data.folderId, updatedAt: new Date() })
        .where(and(
          eq(clientDocuments.id, fileId),
          eq(clientDocuments.clientId, clientId),
          eq(clientDocuments.tenantId, tenantId)
        ))
        .returning();

      if (!document) throw AppError.notFound("Document");
      res.json({ ok: true, document });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.moveFile", req);
    }
  }
);

router.delete(
  "/clients/:clientId/documents/files/:fileId",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, fileId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.deleteFile(tenantId, fileId, clientId);
        return res.json(result);
      }

      const [document] = await db.select()
        .from(clientDocuments)
        .where(and(
          eq(clientDocuments.id, fileId),
          eq(clientDocuments.clientId, clientId),
          eq(clientDocuments.tenantId, tenantId)
        ))
        .limit(1);

      if (!document) throw AppError.notFound("Document");

      try {
        await deleteS3Object(document.storageKey, tenantId);
      } catch (e) {
        console.warn("[client-documents] Failed to delete R2 object:", e);
      }

      await db.delete(clientDocuments)
        .where(and(
          eq(clientDocuments.id, fileId),
          eq(clientDocuments.tenantId, tenantId)
        ));

      res.json({ ok: true, message: "File deleted" });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.deleteFile", req);
    }
  }
);

router.get(
  "/clients/:clientId/documents/files/:fileId/download",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, fileId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.downloadFile(tenantId, fileId, clientId);
        return res.json(result);
      }

      const [document] = await db.select()
        .from(clientDocuments)
        .where(and(
          eq(clientDocuments.id, fileId),
          eq(clientDocuments.clientId, clientId),
          eq(clientDocuments.tenantId, tenantId)
        ))
        .limit(1);

      if (!document) throw AppError.notFound("Document");

      const downloadUrl = await createPresignedDownloadUrl(document.storageKey, tenantId);

      res.json({
        ok: true,
        downloadUrl,
        fileName: document.displayName || document.originalFileName,
      });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.download", req);
    }
  }
);

router.post(
  "/clients/:clientId/documents/bulk/move",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = bulkMoveSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.bulkMove(tenantId, clientId, data.fileIds, data.folderIds, data.destinationFolderId);
        return res.json(result);
      }

      if (data.destinationFolderId) {
        await verifyFolderAccess(data.destinationFolderId, clientId, tenantId);
      }

      let movedFiles = 0;
      let movedFolders = 0;

      if (data.fileIds.length > 0) {
        const result = await db.update(clientDocuments)
          .set({ folderId: data.destinationFolderId, updatedAt: new Date() })
          .where(and(
            inArray(clientDocuments.id, data.fileIds),
            eq(clientDocuments.clientId, clientId),
            eq(clientDocuments.tenantId, tenantId)
          ));
        movedFiles = data.fileIds.length;
      }

      if (data.folderIds.length > 0) {
        for (const fId of data.folderIds) {
          if (data.destinationFolderId && (fId === data.destinationFolderId || await isDescendantOf(data.destinationFolderId, fId, clientId, tenantId))) {
            continue;
          }
          await db.update(clientDocumentFolders)
            .set({ parentFolderId: data.destinationFolderId, updatedAt: new Date() })
            .where(and(
              eq(clientDocumentFolders.id, fId),
              eq(clientDocumentFolders.clientId, clientId),
              eq(clientDocumentFolders.tenantId, tenantId)
            ));
          movedFolders++;
        }
      }

      res.json({ ok: true, movedFiles, movedFolders });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.bulkMove", req);
    }
  }
);

router.post(
  "/clients/:clientId/documents/bulk/delete",
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId } = req.params;
      await verifyClientAccess(clientId, tenantId);

      const data = bulkDeleteSchema.parse(req.body);

      if (useAssetAdapter()) {
        const result = await documentsAssetAdapter.bulkDelete(tenantId, clientId, data.fileIds, data.folderIds);
        return res.json(result);
      }

      let deletedFiles = 0;
      let deletedFolders = 0;

      if (data.fileIds.length > 0) {
        const filesToDelete = await db.select({ id: clientDocuments.id, storageKey: clientDocuments.storageKey })
          .from(clientDocuments)
          .where(and(
            inArray(clientDocuments.id, data.fileIds),
            eq(clientDocuments.clientId, clientId),
            eq(clientDocuments.tenantId, tenantId)
          ));

        for (const f of filesToDelete) {
          try { await deleteS3Object(f.storageKey, tenantId); } catch (e) { /* best effort */ }
        }

        await db.delete(clientDocuments)
          .where(and(
            inArray(clientDocuments.id, data.fileIds),
            eq(clientDocuments.clientId, clientId),
            eq(clientDocuments.tenantId, tenantId)
          ));
        deletedFiles = filesToDelete.length;
      }

      if (data.folderIds.length > 0) {
        for (const fId of data.folderIds) {
          const [hasChildren] = await db.select({ count: count() })
            .from(clientDocumentFolders)
            .where(and(
              eq(clientDocumentFolders.parentFolderId, fId),
              eq(clientDocumentFolders.clientId, clientId),
              eq(clientDocumentFolders.tenantId, tenantId)
            ));
          const [hasFiles] = await db.select({ count: count() })
            .from(clientDocuments)
            .where(and(
              eq(clientDocuments.folderId, fId),
              eq(clientDocuments.clientId, clientId),
              eq(clientDocuments.tenantId, tenantId)
            ));
          if (Number(hasChildren?.count || 0) === 0 && Number(hasFiles?.count || 0) === 0) {
            await db.delete(clientDocumentFolders)
              .where(and(
                eq(clientDocumentFolders.id, fId),
                eq(clientDocumentFolders.clientId, clientId),
                eq(clientDocumentFolders.tenantId, tenantId)
              ));
            deletedFolders++;
          }
        }
      }

      res.json({ ok: true, deletedFiles, deletedFolders });
    } catch (error) {
      handleRouteError(res, error, "clientDocuments.bulkDelete", req);
    }
  }
);

export default router;
