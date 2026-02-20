import { eq, and, desc, ilike, sql, lt } from "drizzle-orm";
import { db } from "../../db";
import { assets, assetLinks } from "@shared/schema";
import type { CreateAssetInput, UpdateAssetInput, ListAssetsFilters } from "./asset.types";

const DEFAULT_LIMIT = 50;

export const assetRepo = {
  async list(filters: ListAssetsFilters) {
    const conditions = [
      eq(assets.tenantId, filters.tenantId),
      eq(assets.clientId, filters.clientId),
      eq(assets.isDeleted, false),
    ];

    if (filters.folderId !== undefined) {
      if (filters.folderId === null || filters.folderId === "root") {
        conditions.push(sql`${assets.folderId} IS NULL`);
      } else {
        conditions.push(eq(assets.folderId, filters.folderId));
      }
    }

    if (filters.q) {
      conditions.push(ilike(assets.title, `%${filters.q}%`));
    }

    if (filters.sourceType) {
      conditions.push(eq(assets.sourceType, filters.sourceType));
    }

    if (filters.visibility) {
      conditions.push(eq(assets.visibility, filters.visibility));
    }

    if (filters.cursor) {
      conditions.push(lt(assets.createdAt, new Date(filters.cursor)));
    }

    const limit = filters.limit || DEFAULT_LIMIT;

    const rows = await db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt?.toISOString() : null;

    return { items, nextCursor, hasMore };
  },

  async getById(id: string, tenantId: string) {
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId), eq(assets.isDeleted, false)))
      .limit(1);
    return asset ?? null;
  },

  async getByR2Key(tenantId: string, r2Key: string) {
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.tenantId, tenantId), eq(assets.r2Key, r2Key)))
      .limit(1);
    return asset ?? null;
  },

  async create(input: CreateAssetInput) {
    const [asset] = await db
      .insert(assets)
      .values({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId || null,
        clientId: input.clientId,
        folderId: input.folderId || null,
        title: input.title,
        description: input.description || null,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        r2Key: input.r2Key,
        checksum: input.checksum || null,
        sourceType: input.sourceType,
        sourceId: input.sourceId || null,
        sourceContextJson: input.sourceContextJson || null,
        visibility: input.visibility,
        uploadedByType: input.uploadedByType,
        uploadedByUserId: input.uploadedByUserId || null,
        uploadedByPortalUserId: input.uploadedByPortalUserId || null,
      })
      .returning();
    return asset;
  },

  async update(id: string, tenantId: string, updates: UpdateAssetInput) {
    const setObj: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.title !== undefined) setObj.title = updates.title;
    if (updates.description !== undefined) setObj.description = updates.description;
    if (updates.folderId !== undefined) setObj.folderId = updates.folderId;
    if (updates.visibility !== undefined) setObj.visibility = updates.visibility;

    const [asset] = await db
      .update(assets)
      .set(setObj)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)))
      .returning();
    return asset ?? null;
  },

  async softDelete(id: string, tenantId: string) {
    const [asset] = await db
      .update(assets)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)))
      .returning();
    return asset ?? null;
  },

  async createLink(tenantId: string, assetId: string, entityType: string, entityId: string) {
    const [link] = await db
      .insert(assetLinks)
      .values({ tenantId, assetId, entityType, entityId })
      .onConflictDoNothing()
      .returning();
    return link ?? null;
  },

  async getLinksForAsset(assetId: string) {
    return db
      .select()
      .from(assetLinks)
      .where(eq(assetLinks.assetId, assetId));
  },

  async getLinksForEntity(entityType: string, entityId: string) {
    return db
      .select()
      .from(assetLinks)
      .where(
        and(
          eq(assetLinks.entityType, entityType),
          eq(assetLinks.entityId, entityId)
        )
      );
  },
};
