import { assetRepo } from "./asset.repo";
import type { AssetSourceType, AssetVisibility, AssetUploaderType } from "@shared/schema";

export interface EnsureAssetParams {
  tenantId: string;
  clientId: string;
  workspaceId?: string | null;
  r2Key: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
  sourceType: AssetSourceType;
  sourceId?: string | null;
  sourceContextJson?: Record<string, unknown> | null;
  visibility?: AssetVisibility;
  uploadedByType?: AssetUploaderType;
  uploadedByUserId?: string | null;
  uploadedByPortalUserId?: string | null;
  entityType?: string;
  entityId?: string;
}

export async function ensureAssetForAttachment(params: EnsureAssetParams) {
  try {
    const existing = await assetRepo.getByR2Key(params.tenantId, params.r2Key);

    let assetId: string;

    if (existing) {
      assetId = existing.id;
    } else {
      const created = await assetRepo.create({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId || null,
        clientId: params.clientId,
        folderId: null,
        title: params.title,
        description: null,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        r2Key: params.r2Key,
        checksum: null,
        sourceType: params.sourceType,
        sourceId: params.sourceId || null,
        sourceContextJson: params.sourceContextJson || null,
        visibility: params.visibility || "internal",
        uploadedByType: params.uploadedByType || "tenant_user",
        uploadedByUserId: params.uploadedByUserId || null,
        uploadedByPortalUserId: params.uploadedByPortalUserId || null,
      });
      assetId = created.id;
    }

    if (params.entityType && params.entityId) {
      await assetRepo.createLink(
        params.tenantId,
        assetId,
        params.entityType,
        params.entityId
      );
    }

    return { assetId, wasExisting: !!existing };
  } catch (error: any) {
    console.error("[assetIndexer] ensureAssetForAttachment error:", {
      r2Key: params.r2Key,
      tenantId: params.tenantId,
      error: error.message,
    });
    return null;
  }
}
