import type { TenantDefaultFolder, TenantDefaultDocument } from "@shared/schema";

export interface CreateFolderInput {
  tenantId: string;
  parentFolderId?: string | null;
  name: string;
  sortOrder?: number;
  createdByUserId?: string;
}

export interface UpdateFolderInput {
  name?: string;
  parentFolderId?: string | null;
  sortOrder?: number;
}

export interface CreateDocumentInput {
  tenantId: string;
  folderId?: string | null;
  title: string;
  description?: string | null;
  r2Key: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  effectiveYear?: number | null;
  createdByUserId?: string;
}

export interface UpdateDocumentInput {
  title?: string;
  description?: string | null;
  folderId?: string | null;
  effectiveYear?: number | null;
}

export interface ReplaceDocumentFileInput {
  r2Key: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface TenantDefaultTreeResponse {
  folders: TenantDefaultFolder[];
  documents: TenantDefaultDocument[];
}
