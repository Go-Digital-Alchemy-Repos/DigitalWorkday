import type { AssetSourceType, AssetVisibility, AssetUploaderType } from "@shared/schema";

export interface ListAssetsFilters {
  tenantId: string;
  clientId: string;
  folderId?: string | null;
  q?: string;
  sourceType?: AssetSourceType;
  visibility?: AssetVisibility;
  cursor?: string;
  limit?: number;
}

export interface CreateAssetInput {
  tenantId: string;
  workspaceId?: string | null;
  clientId: string;
  folderId?: string | null;
  title: string;
  description?: string | null;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
  checksum?: string | null;
  sourceType: AssetSourceType;
  sourceId?: string | null;
  sourceContextJson?: Record<string, unknown> | null;
  visibility: AssetVisibility;
  uploadedByType: AssetUploaderType;
  uploadedByUserId?: string | null;
  uploadedByPortalUserId?: string | null;
}

export interface UpdateAssetInput {
  title?: string;
  description?: string | null;
  folderId?: string | null;
  visibility?: AssetVisibility;
}

export interface CreateFolderInput {
  tenantId: string;
  workspaceId?: string | null;
  clientId: string;
  parentFolderId?: string | null;
  name: string;
  createdByUserId?: string | null;
}

export interface AssetWithLinks {
  id: string;
  tenantId: string;
  clientId: string;
  folderId: string | null;
  title: string;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
  sourceType: string;
  sourceId: string | null;
  sourceContextJson: unknown;
  visibility: string;
  uploadedByType: string;
  uploadedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
