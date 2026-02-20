import { db } from "../db";
import { clientDocuments, clientDocumentFolders, assets, assetFolders } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`[backfill-docs-to-assets] ${DRY_RUN ? "DRY RUN" : "LIVE RUN"}`);

  const allFolders = await db.select().from(clientDocumentFolders);
  console.log(`[backfill] Found ${allFolders.length} document folders to check`);

  let foldersMigrated = 0;
  let foldersSkipped = 0;
  const folderIdMap = new Map<string, string>();

  const foldersByParent = new Map<string | null, typeof allFolders>();
  for (const folder of allFolders) {
    const key = folder.parentFolderId;
    if (!foldersByParent.has(key)) foldersByParent.set(key, []);
    foldersByParent.get(key)!.push(folder);
  }

  async function processLevel(parentDocFolderId: string | null) {
    const foldersAtLevel = foldersByParent.get(parentDocFolderId) || [];
    for (const folder of foldersAtLevel) {
      const mappedParentId = parentDocFolderId ? (folderIdMap.get(parentDocFolderId) || null) : null;

      const existingConditions = [
        eq(assetFolders.tenantId, folder.tenantId),
        eq(assetFolders.clientId, folder.clientId),
        eq(assetFolders.name, folder.name),
      ];
      if (mappedParentId) {
        existingConditions.push(eq(assetFolders.parentFolderId, mappedParentId));
      } else {
        existingConditions.push(isNull(assetFolders.parentFolderId));
      }

      const [existing] = await db
        .select({ id: assetFolders.id })
        .from(assetFolders)
        .where(and(...existingConditions))
        .limit(1);

      if (existing) {
        folderIdMap.set(folder.id, existing.id);
        foldersSkipped++;
      } else if (!DRY_RUN) {
        const resolvedParent = mappedParentId && !mappedParentId.startsWith("dry-run-") ? mappedParentId : null;
        const [newFolder] = await db
          .insert(assetFolders)
          .values({
            tenantId: folder.tenantId,
            clientId: folder.clientId,
            name: folder.name,
            parentFolderId: resolvedParent,
            createdByUserId: folder.createdByUserId,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
          })
          .returning();
        folderIdMap.set(folder.id, newFolder.id);
        foldersMigrated++;
      } else {
        folderIdMap.set(folder.id, `dry-run-${folder.id}`);
        foldersMigrated++;
      }

      await processLevel(folder.id);
    }
  }

  await processLevel(null);

  console.log(`[backfill] Folders: ${foldersMigrated} migrated, ${foldersSkipped} already existed`);

  const allDocs = await db
    .select()
    .from(clientDocuments)
    .where(eq(clientDocuments.uploadStatus, "complete"));

  console.log(`[backfill] Found ${allDocs.length} completed documents to check`);

  let docsMigrated = 0;
  let docsSkipped = 0;
  let docsError = 0;

  for (const doc of allDocs) {
    const [existing] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.tenantId, doc.tenantId),
          eq(assets.r2Key, doc.storageKey)
        )
      )
      .limit(1);

    if (existing) {
      docsSkipped++;
      continue;
    }

    const assetFolderId = doc.folderId ? (folderIdMap.get(doc.folderId) || null) : null;
    const resolvedFolderId = assetFolderId?.startsWith("dry-run-") ? null : assetFolderId;

    if (!DRY_RUN) {
      try {
        await db.insert(assets).values({
          tenantId: doc.tenantId,
          clientId: doc.clientId,
          folderId: resolvedFolderId,
          title: doc.displayName || doc.originalFileName,
          mimeType: doc.mimeType,
          sizeBytes: doc.fileSizeBytes,
          r2Key: doc.storageKey,
          sourceType: "manual",
          sourceId: doc.id,
          sourceContextJson: {
            migratedFrom: "client_documents",
            originalId: doc.id,
            originalFileName: doc.originalFileName,
          },
          visibility: "internal",
          uploadedByType: "tenant_user",
          uploadedByUserId: doc.uploadedByUserId,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        });
        docsMigrated++;
      } catch (e: any) {
        console.error(`[backfill] Error migrating doc ${doc.id}: ${e.message}`);
        docsError++;
      }
    } else {
      docsMigrated++;
    }
  }

  console.log(`[backfill] Documents: ${docsMigrated} migrated, ${docsSkipped} already existed, ${docsError} errors`);
  console.log(`[backfill] Complete. ${DRY_RUN ? "Re-run without --dry-run to apply." : "All changes applied."}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill] Fatal error:", e);
  process.exit(1);
});
