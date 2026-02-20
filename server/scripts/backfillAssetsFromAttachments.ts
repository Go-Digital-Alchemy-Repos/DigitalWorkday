import { db } from "../db";
import { taskAttachments, clientDocuments, tasks, projects } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { ensureAssetForAttachment } from "../features/assetLibrary/assetIndexer";

async function backfillTaskAttachments() {
  console.log("[backfill] Starting task attachments backfill...");
  let created = 0;
  let skipped = 0;
  let errors = 0;

  const allAttachments = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.uploadStatus, "complete"));

  console.log(`[backfill] Found ${allAttachments.length} completed task attachments`);

  for (const att of allAttachments) {
    try {
      const task = await db.select().from(tasks).where(eq(tasks.id, att.taskId)).limit(1);
      if (!task[0]?.projectId) { skipped++; continue; }

      const project = await db.select().from(projects).where(eq(projects.id, task[0].projectId)).limit(1);
      if (!project[0]?.clientId) { skipped++; continue; }

      const tenantId = project[0].tenantId;
      if (!tenantId) { skipped++; continue; }

      const result = await ensureAssetForAttachment({
        tenantId,
        clientId: project[0].clientId,
        workspaceId: project[0].workspaceId || null,
        r2Key: att.storageKey,
        mimeType: att.mimeType,
        sizeBytes: att.fileSizeBytes,
        title: att.originalFileName,
        sourceType: "task",
        sourceId: att.taskId,
        sourceContextJson: { taskId: att.taskId, projectId: att.projectId, attachmentId: att.id },
        visibility: "internal",
        uploadedByType: "tenant_user",
        uploadedByUserId: att.uploadedByUserId,
        entityType: "task_attachment",
        entityId: att.id,
      });

      if (result?.wasExisting) skipped++;
      else created++;
    } catch (err: any) {
      errors++;
      console.error(`[backfill] Error processing task attachment ${att.id}: ${err.message}`);
    }
  }

  console.log(`[backfill] Task attachments: created=${created}, skipped=${skipped}, errors=${errors}`);
}

async function backfillClientDocuments() {
  console.log("[backfill] Starting client documents backfill...");
  let created = 0;
  let skipped = 0;
  let errors = 0;

  const allDocs = await db
    .select()
    .from(clientDocuments)
    .where(eq(clientDocuments.uploadStatus, "complete"));

  console.log(`[backfill] Found ${allDocs.length} completed client documents`);

  for (const doc of allDocs) {
    try {
      const result = await ensureAssetForAttachment({
        tenantId: doc.tenantId,
        clientId: doc.clientId,
        r2Key: doc.storageKey,
        mimeType: doc.mimeType,
        sizeBytes: doc.fileSizeBytes,
        title: doc.displayName || doc.originalFileName,
        sourceType: "manual",
        sourceId: doc.id,
        sourceContextJson: { clientDocumentId: doc.id, categoryId: doc.categoryId, folderId: doc.folderId },
        visibility: doc.isClientUploaded ? "client_visible" : "internal",
        uploadedByType: doc.isClientUploaded ? "portal_user" : "tenant_user",
        uploadedByUserId: doc.uploadedByUserId,
        entityType: "client_document",
        entityId: doc.id,
      });

      if (result?.wasExisting) skipped++;
      else created++;
    } catch (err: any) {
      errors++;
      console.error(`[backfill] Error processing client document ${doc.id}: ${err.message}`);
    }
  }

  console.log(`[backfill] Client documents: created=${created}, skipped=${skipped}, errors=${errors}`);
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (isDryRun) {
    console.log("[backfill] DRY RUN - no records will be created");
    const taskAtts = await db.select().from(taskAttachments).where(eq(taskAttachments.uploadStatus, "complete"));
    const docs = await db.select().from(clientDocuments).where(eq(clientDocuments.uploadStatus, "complete"));
    console.log(`[backfill] Would process: ${taskAtts.length} task attachments, ${docs.length} client documents`);
    process.exit(0);
  }

  console.log("[backfill] Starting asset backfill from existing attachments...");
  await backfillTaskAttachments();
  await backfillClientDocuments();
  console.log("[backfill] Backfill complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
