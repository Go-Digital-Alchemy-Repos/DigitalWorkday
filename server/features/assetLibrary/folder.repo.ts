import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { assetFolders, assets } from "@shared/schema";
import type { CreateFolderInput } from "./asset.types";

export const folderRepo = {
  async list(tenantId: string, clientId: string) {
    return db
      .select()
      .from(assetFolders)
      .where(
        and(
          eq(assetFolders.tenantId, tenantId),
          eq(assetFolders.clientId, clientId)
        )
      )
      .orderBy(assetFolders.sortOrder, assetFolders.name);
  },

  async getById(id: string, tenantId: string) {
    const [folder] = await db
      .select()
      .from(assetFolders)
      .where(and(eq(assetFolders.id, id), eq(assetFolders.tenantId, tenantId)))
      .limit(1);
    return folder ?? null;
  },

  async create(input: CreateFolderInput) {
    const [folder] = await db
      .insert(assetFolders)
      .values({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId || null,
        clientId: input.clientId,
        parentFolderId: input.parentFolderId || null,
        name: input.name,
        createdByUserId: input.createdByUserId || null,
      })
      .returning();
    return folder;
  },

  async rename(id: string, tenantId: string, name: string) {
    const [folder] = await db
      .update(assetFolders)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(assetFolders.id, id), eq(assetFolders.tenantId, tenantId)))
      .returning();
    return folder ?? null;
  },

  async move(id: string, tenantId: string, newParentFolderId: string | null) {
    const [folder] = await db
      .update(assetFolders)
      .set({ parentFolderId: newParentFolderId, updatedAt: new Date() })
      .where(and(eq(assetFolders.id, id), eq(assetFolders.tenantId, tenantId)))
      .returning();
    return folder ?? null;
  },

  async remove(id: string, tenantId: string) {
    const children = await db
      .select({ id: assetFolders.id })
      .from(assetFolders)
      .where(
        and(
          eq(assetFolders.parentFolderId, id),
          eq(assetFolders.tenantId, tenantId)
        )
      )
      .limit(1);
    if (children.length > 0) {
      throw new Error("Cannot delete folder with subfolders");
    }

    const assetCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(assets)
      .where(
        and(
          eq(assets.folderId, id),
          eq(assets.tenantId, tenantId),
          eq(assets.isDeleted, false)
        )
      );
    if (assetCount[0]?.count > 0) {
      throw new Error("Cannot delete folder with assets");
    }

    await db
      .delete(assetFolders)
      .where(and(eq(assetFolders.id, id), eq(assetFolders.tenantId, tenantId)));
  },

  async updateSortOrders(tenantId: string, updates: { id: string; sortOrder: number }[]) {
    for (const u of updates) {
      await db
        .update(assetFolders)
        .set({ sortOrder: u.sortOrder, updatedAt: new Date() })
        .where(and(eq(assetFolders.id, u.id), eq(assetFolders.tenantId, tenantId)));
    }
  },
};
