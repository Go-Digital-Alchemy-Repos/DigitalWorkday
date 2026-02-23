import { assetRepo } from "./asset.repo";
import { folderRepo } from "./folder.repo";
import type {
  CreateAssetInput,
  UpdateAssetInput,
  ListAssetsFilters,
  CreateFolderInput,
} from "./asset.types";

export const assetService = {
  async listFolders(tenantId: string, clientId: string) {
    return folderRepo.list(tenantId, clientId);
  },

  async createFolder(input: CreateFolderInput) {
    if (input.parentFolderId) {
      const parent = await folderRepo.getById(input.parentFolderId, input.tenantId);
      if (!parent || parent.clientId !== input.clientId) {
        throw new Error("Parent folder not found or belongs to different client");
      }
    }
    return folderRepo.create(input);
  },

  async renameFolder(tenantId: string, folderId: string, name: string) {
    const folder = await folderRepo.getById(folderId, tenantId);
    if (!folder) throw new Error("Folder not found");
    return folderRepo.rename(folderId, tenantId, name);
  },

  async moveFolder(tenantId: string, folderId: string, newParentFolderId: string | null) {
    const folder = await folderRepo.getById(folderId, tenantId);
    if (!folder) throw new Error("Folder not found");
    if (newParentFolderId === folderId) {
      throw new Error("Cannot move folder into itself");
    }
    if (newParentFolderId) {
      const newParent = await folderRepo.getById(newParentFolderId, tenantId);
      if (!newParent || newParent.clientId !== folder.clientId) {
        throw new Error("Target parent folder not found or belongs to different client");
      }
    }
    return folderRepo.move(folderId, tenantId, newParentFolderId);
  },

  async deleteFolder(tenantId: string, folderId: string) {
    const folder = await folderRepo.getById(folderId, tenantId);
    if (!folder) throw new Error("Folder not found");
    return folderRepo.remove(folderId, tenantId);
  },

  async reorderFolders(tenantId: string, updates: { id: string; sortOrder: number }[]) {
    return folderRepo.updateSortOrders(tenantId, updates);
  },

  async listAssets(filters: ListAssetsFilters) {
    return assetRepo.list(filters);
  },

  async getAsset(tenantId: string, assetId: string) {
    return assetRepo.getById(assetId, tenantId);
  },

  async createAsset(input: CreateAssetInput) {
    const existing = await assetRepo.getByR2Key(input.tenantId, input.r2Key);
    if (existing && existing.clientId === input.clientId) {
      if (existing.isDeleted) {
        await assetRepo.update(existing.id, input.tenantId, {
          title: input.title,
          folderId: input.folderId,
          visibility: input.visibility,
        });
        return { asset: await assetRepo.getById(existing.id, input.tenantId), dedupe: true };
      }
      return { asset: existing, dedupe: true };
    }

    if (input.folderId) {
      const folder = await folderRepo.getById(input.folderId, input.tenantId);
      if (!folder || folder.clientId !== input.clientId) {
        throw new Error("Target folder not found or belongs to different client");
      }
    }

    const asset = await assetRepo.create(input);
    return { asset, dedupe: false };
  },

  async updateAssetMeta(tenantId: string, assetId: string, updates: UpdateAssetInput) {
    const asset = await assetRepo.getById(assetId, tenantId);
    if (!asset) throw new Error("Asset not found");
    return assetRepo.update(assetId, tenantId, updates);
  },

  async deleteAsset(tenantId: string, assetId: string) {
    const asset = await assetRepo.getById(assetId, tenantId);
    if (!asset) throw new Error("Asset not found");
    return assetRepo.softDelete(assetId, tenantId);
  },

  async createLink(tenantId: string, assetId: string, entityType: string, entityId: string) {
    return assetRepo.createLink(tenantId, assetId, entityType, entityId);
  },

  async getLinksForAsset(assetId: string) {
    return assetRepo.getLinksForAsset(assetId);
  },
};
