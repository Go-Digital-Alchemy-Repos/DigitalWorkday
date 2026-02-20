import { db } from "../../db";
import { assets, assetFolders, users } from "@shared/schema";
import { eq, and, sql, isNull, ilike, asc, desc, inArray } from "drizzle-orm";
import { assetService } from "../assetLibrary/asset.service";
import { folderRepo } from "../assetLibrary/folder.repo";
import { assetRepo } from "../assetLibrary/asset.repo";
import {
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  deleteS3Object,
  validateFile,
} from "../../s3";
import { sanitizeFilename, isFilenameUnsafe } from "../../http/middleware/uploadGuards";
import { AppError } from "../../lib/errors";
import crypto from "crypto";

interface DocumentsFolderShape {
  id: string;
  name: string;
  parentFolderId: string | null;
  clientId: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

interface DocumentsFileShape {
  id: string;
  clientId: string;
  folderId: string | null;
  originalFileName: string;
  displayName: string | null;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  createdAt: string;
  updatedAt: string;
  uploadedByUserId: string | null;
  uploaderFirstName: string | null;
  uploaderLastName: string | null;
}

function extractOriginalFileName(asset: any): string {
  const ctx = asset.sourceContextJson;
  if (ctx && typeof ctx === "object" && ctx.originalFileName) {
    return ctx.originalFileName;
  }
  return asset.title;
}

function assetToFileShape(asset: any, uploaderInfo?: { firstName: string | null; lastName: string | null }): DocumentsFileShape {
  return {
    id: asset.id,
    clientId: asset.clientId,
    folderId: asset.folderId,
    originalFileName: extractOriginalFileName(asset),
    displayName: asset.title,
    mimeType: asset.mimeType,
    fileSizeBytes: asset.sizeBytes,
    storageKey: asset.r2Key,
    createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : asset.createdAt,
    updatedAt: asset.updatedAt instanceof Date ? asset.updatedAt.toISOString() : asset.updatedAt,
    uploadedByUserId: asset.uploadedByUserId,
    uploaderFirstName: uploaderInfo?.firstName ?? null,
    uploaderLastName: uploaderInfo?.lastName ?? null,
  };
}

export const documentsAssetAdapter = {
  async getFolderTree(tenantId: string, clientId: string) {
    const folders = await folderRepo.list(tenantId, clientId);

    const fileCounts = await db
      .select({
        folderId: assets.folderId,
        count: sql<number>`count(*)`,
      })
      .from(assets)
      .where(
        and(
          eq(assets.clientId, clientId),
          eq(assets.tenantId, tenantId),
          eq(assets.isDeleted, false)
        )
      )
      .groupBy(assets.folderId);

    const countMap = new Map<string | null, number>();
    for (const row of fileCounts) {
      countMap.set(row.folderId, Number(row.count));
    }

    const foldersWithCounts: DocumentsFolderShape[] = folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentFolderId: f.parentFolderId,
      clientId: f.clientId,
      tenantId: f.tenantId,
      createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
      updatedAt: f.updatedAt instanceof Date ? f.updatedAt.toISOString() : String(f.updatedAt),
      fileCount: countMap.get(f.id) || 0,
    }));

    return {
      ok: true,
      folders: foldersWithCounts,
      rootFileCount: countMap.get(null) || 0,
    };
  },

  async createFolder(
    tenantId: string,
    clientId: string,
    userId: string,
    name: string,
    parentFolderId: string | null
  ) {
    const folder = await assetService.createFolder({
      tenantId,
      clientId,
      name,
      parentFolderId,
      createdByUserId: userId,
    });

    return {
      ok: true,
      folder: {
        ...folder,
        createdAt: folder.createdAt instanceof Date ? folder.createdAt.toISOString() : folder.createdAt,
        updatedAt: folder.updatedAt instanceof Date ? folder.updatedAt.toISOString() : folder.updatedAt,
      },
    };
  },

  async renameFolder(tenantId: string, folderId: string, clientId: string, name: string) {
    const folder = await folderRepo.getById(folderId, tenantId);
    if (!folder || folder.clientId !== clientId) {
      throw AppError.notFound("Folder");
    }
    const updated = await assetService.renameFolder(tenantId, folderId, name);
    return {
      ok: true,
      folder: {
        ...updated,
        createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
        updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
  },

  async moveFolder(tenantId: string, folderId: string, clientId: string, parentFolderId: string | null) {
    const folder = await folderRepo.getById(folderId, tenantId);
    if (!folder || folder.clientId !== clientId) {
      throw AppError.notFound("Folder");
    }
    if (parentFolderId === folderId) {
      throw AppError.badRequest("Cannot move a folder into itself");
    }
    if (parentFolderId) {
      const parent = await folderRepo.getById(parentFolderId, tenantId);
      if (!parent || parent.clientId !== clientId) {
        throw AppError.notFound("Destination folder");
      }
      let currentId: string | null = parentFolderId;
      const visited = new Set<string>();
      while (currentId) {
        if (currentId === folderId) {
          throw AppError.badRequest("Cannot move a folder into one of its subfolders");
        }
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const f = await folderRepo.getById(currentId, tenantId);
        currentId = f?.parentFolderId ?? null;
      }
    }
    const updated = await assetService.moveFolder(tenantId, folderId, parentFolderId);
    return {
      ok: true,
      folder: {
        ...updated,
        createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
        updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
  },

  async deleteFolder(tenantId: string, folderId: string, clientId: string) {
    const folder = await folderRepo.getById(folderId, tenantId);
    if (!folder || folder.clientId !== clientId) {
      throw AppError.notFound("Folder");
    }
    await assetService.deleteFolder(tenantId, folderId);
    return { ok: true, message: "Folder deleted" };
  },

  async listFiles(
    tenantId: string,
    clientId: string,
    options: {
      folderId?: string | null;
      q?: string;
      sort?: string;
    }
  ) {
    const conditions = [
      eq(assets.clientId, clientId),
      eq(assets.tenantId, tenantId),
      eq(assets.isDeleted, false),
    ];

    if (options.q && options.q.trim()) {
      conditions.push(ilike(assets.title, `%${options.q.trim()}%`));
    } else if (options.folderId === "null" || options.folderId === undefined || options.folderId === "") {
      conditions.push(isNull(assets.folderId));
    } else if (options.folderId) {
      conditions.push(eq(assets.folderId, options.folderId));
    }

    let orderBy;
    switch (options.sort) {
      case "name_asc": orderBy = asc(assets.title); break;
      case "name_desc": orderBy = desc(assets.title); break;
      case "size_asc": orderBy = asc(assets.sizeBytes); break;
      case "size_desc": orderBy = desc(assets.sizeBytes); break;
      case "oldest": orderBy = asc(assets.createdAt); break;
      case "newest":
      default: orderBy = desc(assets.createdAt); break;
    }

    const rows = await db
      .select({
        id: assets.id,
        clientId: assets.clientId,
        folderId: assets.folderId,
        title: assets.title,
        mimeType: assets.mimeType,
        sizeBytes: assets.sizeBytes,
        r2Key: assets.r2Key,
        sourceContextJson: assets.sourceContextJson,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        uploadedByUserId: assets.uploadedByUserId,
        uploaderFirstName: users.firstName,
        uploaderLastName: users.lastName,
      })
      .from(assets)
      .leftJoin(users, eq(assets.uploadedByUserId, users.id))
      .where(and(...conditions))
      .orderBy(orderBy);

    const files: DocumentsFileShape[] = rows.map((row) =>
      assetToFileShape(
        {
          id: row.id,
          clientId: row.clientId,
          folderId: row.folderId,
          title: row.title,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          r2Key: row.r2Key,
          sourceContextJson: row.sourceContextJson,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          uploadedByUserId: row.uploadedByUserId,
        },
        {
          firstName: row.uploaderFirstName,
          lastName: row.uploaderLastName,
        }
      )
    );

    return { ok: true, files };
  },

  async presignUpload(
    tenantId: string,
    clientId: string,
    folderId: string | null,
    filename: string,
    mimeType: string,
    sizeBytes: number
  ) {
    const safeName = sanitizeFilename(filename);
    if (isFilenameUnsafe(safeName)) {
      throw AppError.badRequest("This file type is not allowed for security reasons");
    }

    const validation = validateFile(mimeType, sizeBytes, safeName);
    if (!validation.valid) {
      throw AppError.badRequest(validation.error || "File validation failed");
    }

    if (folderId) {
      const folder = await folderRepo.getById(folderId, tenantId);
      if (!folder || folder.clientId !== clientId) {
        throw AppError.notFound("Folder");
      }
    }

    const tempId = crypto.randomUUID();
    const r2Key = `assets/${tenantId}/${clientId}/${tempId}-${safeName}`;

    const presigned = await createPresignedUploadUrl(r2Key, mimeType, tenantId);

    return {
      ok: true,
      uploadUrl: presigned.url,
      r2Key,
      method: presigned.method,
      headers: presigned.headers,
    };
  },

  async completeUpload(
    tenantId: string,
    clientId: string,
    userId: string,
    data: {
      folderId?: string | null;
      r2Key: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      checksum?: string;
      displayName?: string;
    }
  ) {
    const { asset, dedupe } = await assetService.createAsset({
      tenantId,
      clientId,
      folderId: data.folderId || null,
      title: data.displayName || data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      r2Key: data.r2Key,
      checksum: data.checksum || null,
      sourceType: "manual",
      sourceContextJson: { originalFileName: data.filename },
      visibility: "internal",
      uploadedByType: "tenant_user",
      uploadedByUserId: userId,
    });

    const document = asset
      ? {
          id: asset.id,
          clientId: asset.clientId,
          folderId: asset.folderId,
          originalFileName: data.filename,
          displayName: data.displayName || data.filename,
          mimeType: asset.mimeType,
          fileSizeBytes: asset.sizeBytes,
          storageKey: asset.r2Key,
          createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : asset.createdAt,
          updatedAt: asset.updatedAt instanceof Date ? asset.updatedAt.toISOString() : asset.updatedAt,
          uploadedByUserId: asset.uploadedByUserId,
        }
      : null;

    return { ok: true, document };
  },

  async renameFile(tenantId: string, fileId: string, clientId: string, displayName: string) {
    const asset = await assetRepo.getById(fileId, tenantId);
    if (!asset || asset.clientId !== clientId) {
      throw AppError.notFound("Document");
    }
    const updated = await assetRepo.update(fileId, tenantId, { title: displayName });
    if (!updated) throw AppError.notFound("Document");

    return {
      ok: true,
      document: {
        id: updated.id,
        clientId: updated.clientId,
        folderId: updated.folderId,
        originalFileName: updated.title,
        displayName: updated.title,
        mimeType: updated.mimeType,
        fileSizeBytes: updated.sizeBytes,
        storageKey: updated.r2Key,
        createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
        updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
  },

  async moveFile(tenantId: string, fileId: string, clientId: string, folderId: string | null) {
    const asset = await assetRepo.getById(fileId, tenantId);
    if (!asset || asset.clientId !== clientId) {
      throw AppError.notFound("Document");
    }
    if (folderId) {
      const folder = await folderRepo.getById(folderId, tenantId);
      if (!folder || folder.clientId !== clientId) {
        throw AppError.notFound("Destination folder");
      }
    }
    const updated = await assetRepo.update(fileId, tenantId, { folderId });
    if (!updated) throw AppError.notFound("Document");

    return {
      ok: true,
      document: {
        id: updated.id,
        clientId: updated.clientId,
        folderId: updated.folderId,
        originalFileName: updated.title,
        displayName: updated.title,
        mimeType: updated.mimeType,
        fileSizeBytes: updated.sizeBytes,
        storageKey: updated.r2Key,
        createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
        updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
  },

  async deleteFile(tenantId: string, fileId: string, clientId: string) {
    const asset = await assetRepo.getById(fileId, tenantId);
    if (!asset || asset.clientId !== clientId) {
      throw AppError.notFound("Document");
    }
    await assetRepo.softDelete(fileId, tenantId);
    return { ok: true, message: "File deleted" };
  },

  async downloadFile(tenantId: string, fileId: string, clientId: string) {
    const asset = await assetRepo.getById(fileId, tenantId);
    if (!asset || asset.clientId !== clientId) {
      throw AppError.notFound("Document");
    }
    const downloadUrl = await createPresignedDownloadUrl(asset.r2Key, tenantId);
    return {
      ok: true,
      downloadUrl,
      fileName: asset.title,
    };
  },

  async bulkMove(
    tenantId: string,
    clientId: string,
    fileIds: string[],
    folderIds: string[],
    destinationFolderId: string | null
  ) {
    if (destinationFolderId) {
      const folder = await folderRepo.getById(destinationFolderId, tenantId);
      if (!folder || folder.clientId !== clientId) {
        throw AppError.notFound("Destination folder");
      }
    }

    let movedFiles = 0;
    let movedFolders = 0;

    if (fileIds.length > 0) {
      for (const fId of fileIds) {
        const asset = await assetRepo.getById(fId, tenantId);
        if (asset && asset.clientId === clientId) {
          await assetRepo.update(fId, tenantId, { folderId: destinationFolderId });
          movedFiles++;
        }
      }
    }

    if (folderIds.length > 0) {
      for (const fId of folderIds) {
        const folder = await folderRepo.getById(fId, tenantId);
        if (!folder || folder.clientId !== clientId) continue;
        if (destinationFolderId && fId === destinationFolderId) continue;

        if (destinationFolderId) {
          let currentId: string | null = destinationFolderId;
          let isCycle = false;
          const visited = new Set<string>();
          while (currentId) {
            if (currentId === fId) { isCycle = true; break; }
            if (visited.has(currentId)) break;
            visited.add(currentId);
            const parent = await folderRepo.getById(currentId, tenantId);
            currentId = parent?.parentFolderId ?? null;
          }
          if (isCycle) continue;
        }

        await assetService.moveFolder(tenantId, fId, destinationFolderId);
        movedFolders++;
      }
    }

    return { ok: true, movedFiles, movedFolders };
  },

  async bulkDelete(tenantId: string, clientId: string, fileIds: string[], folderIds: string[]) {
    let deletedFiles = 0;
    let deletedFolders = 0;

    if (fileIds.length > 0) {
      for (const fId of fileIds) {
        const asset = await assetRepo.getById(fId, tenantId);
        if (asset && asset.clientId === clientId) {
          await assetRepo.softDelete(fId, tenantId);
          deletedFiles++;
        }
      }
    }

    if (folderIds.length > 0) {
      for (const fId of folderIds) {
        try {
          await this.deleteFolder(tenantId, fId, clientId);
          deletedFolders++;
        } catch {
        }
      }
    }

    return { ok: true, deletedFiles, deletedFolders };
  },
};
