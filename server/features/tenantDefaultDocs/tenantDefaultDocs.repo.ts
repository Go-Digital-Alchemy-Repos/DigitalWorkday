import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db";
import { tenantDefaultFolders, tenantDefaultDocuments } from "@shared/schema";
import type {
  CreateFolderInput,
  UpdateFolderInput,
  CreateDocumentInput,
  UpdateDocumentInput,
  ReplaceDocumentFileInput,
  TenantDefaultTreeResponse,
} from "./tenantDefaultDocs.types";

export const tenantDefaultDocsRepo = {
  async createFolder(input: CreateFolderInput) {
    const [folder] = await db
      .insert(tenantDefaultFolders)
      .values({
        tenantId: input.tenantId,
        parentFolderId: input.parentFolderId ?? null,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        createdByUserId: input.createdByUserId ?? null,
      })
      .returning();
    return folder;
  },

  async updateFolder(folderId: string, tenantId: string, patch: UpdateFolderInput, userId?: string) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.parentFolderId !== undefined) updates.parentFolderId = patch.parentFolderId;
    if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder;

    const [folder] = await db
      .update(tenantDefaultFolders)
      .set(updates)
      .where(and(eq(tenantDefaultFolders.id, folderId), eq(tenantDefaultFolders.tenantId, tenantId)))
      .returning();
    return folder ?? null;
  },

  async softDeleteFolder(folderId: string, tenantId: string) {
    const [folder] = await db
      .update(tenantDefaultFolders)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(tenantDefaultFolders.id, folderId), eq(tenantDefaultFolders.tenantId, tenantId)))
      .returning();
    return folder ?? null;
  },

  async listFolders(tenantId: string) {
    return db
      .select()
      .from(tenantDefaultFolders)
      .where(and(eq(tenantDefaultFolders.tenantId, tenantId), eq(tenantDefaultFolders.isDeleted, false)))
      .orderBy(tenantDefaultFolders.sortOrder, tenantDefaultFolders.name);
  },

  async getFolderById(folderId: string, tenantId: string) {
    const [folder] = await db
      .select()
      .from(tenantDefaultFolders)
      .where(and(eq(tenantDefaultFolders.id, folderId), eq(tenantDefaultFolders.tenantId, tenantId)));
    return folder ?? null;
  },

  async createDocument(input: CreateDocumentInput) {
    const [doc] = await db
      .insert(tenantDefaultDocuments)
      .values({
        tenantId: input.tenantId,
        folderId: input.folderId ?? null,
        title: input.title,
        description: input.description ?? null,
        r2Key: input.r2Key,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        effectiveYear: input.effectiveYear ?? null,
        createdByUserId: input.createdByUserId ?? null,
        updatedByUserId: input.createdByUserId ?? null,
      })
      .returning();
    return doc;
  },

  async updateDocument(docId: string, tenantId: string, patch: UpdateDocumentInput, userId?: string) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (userId) updates.updatedByUserId = userId;
    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.description !== undefined) updates.description = patch.description;
    if (patch.folderId !== undefined) updates.folderId = patch.folderId;
    if (patch.effectiveYear !== undefined) updates.effectiveYear = patch.effectiveYear;

    const [doc] = await db
      .update(tenantDefaultDocuments)
      .set(updates)
      .where(and(eq(tenantDefaultDocuments.id, docId), eq(tenantDefaultDocuments.tenantId, tenantId)))
      .returning();
    return doc ?? null;
  },

  async replaceDocumentFile(docId: string, tenantId: string, file: ReplaceDocumentFileInput, userId?: string) {
    const updates: Record<string, any> = {
      r2Key: file.r2Key,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
      version: sql`${tenantDefaultDocuments.version} + 1`,
      updatedAt: new Date(),
    };
    if (userId) updates.updatedByUserId = userId;

    const [doc] = await db
      .update(tenantDefaultDocuments)
      .set(updates)
      .where(and(eq(tenantDefaultDocuments.id, docId), eq(tenantDefaultDocuments.tenantId, tenantId)))
      .returning();
    return doc ?? null;
  },

  async softDeleteDocument(docId: string, tenantId: string, userId?: string) {
    const updates: Record<string, any> = { isDeleted: true, updatedAt: new Date() };
    if (userId) updates.updatedByUserId = userId;

    const [doc] = await db
      .update(tenantDefaultDocuments)
      .set(updates)
      .where(and(eq(tenantDefaultDocuments.id, docId), eq(tenantDefaultDocuments.tenantId, tenantId)))
      .returning();
    return doc ?? null;
  },

  async listDocuments(tenantId: string, folderId?: string | null) {
    const conditions = [
      eq(tenantDefaultDocuments.tenantId, tenantId),
      eq(tenantDefaultDocuments.isDeleted, false),
    ];
    if (folderId !== undefined) {
      if (folderId === null) {
        conditions.push(sql`${tenantDefaultDocuments.folderId} IS NULL`);
      } else {
        conditions.push(eq(tenantDefaultDocuments.folderId, folderId));
      }
    }

    return db
      .select()
      .from(tenantDefaultDocuments)
      .where(and(...conditions))
      .orderBy(tenantDefaultDocuments.title);
  },

  async getDocumentById(docId: string, tenantId: string) {
    const [doc] = await db
      .select()
      .from(tenantDefaultDocuments)
      .where(and(eq(tenantDefaultDocuments.id, docId), eq(tenantDefaultDocuments.tenantId, tenantId)));
    return doc ?? null;
  },

  async getTree(tenantId: string): Promise<TenantDefaultTreeResponse> {
    const [folders, documents] = await Promise.all([
      this.listFolders(tenantId),
      this.listDocuments(tenantId),
    ]);
    return { folders, documents };
  },
};
