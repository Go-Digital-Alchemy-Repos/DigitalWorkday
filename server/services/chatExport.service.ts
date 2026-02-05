/**
 * Chat Export Service
 * 
 * Handles exporting chat data to JSONL format and uploading to Cloudflare R2.
 * Supports tenant-scoped exports and all-tenants exports for Super Admins.
 */
import { storage as IStorage } from "../storage";
import { uploadToS3, isR2Configured } from "../s3";
import type { ChatExportJob, ChatMessage } from "@shared/schema";
import { db } from "../db";
import { chatMessages, chatChannels, chatDmThreads, chatAttachments, users, tenants } from "@shared/schema";
import { eq, and, lte, isNull, sql, desc, asc, or } from "drizzle-orm";

interface ExportProgress {
  phase: "channels" | "dms" | "messages" | "attachments" | "uploading" | "done";
  processedMessages: number;
  totalMessages: number;
  processedChannels: number;
  totalChannels: number;
  processedDms: number;
  totalDms: number;
}

interface ExportResult {
  success: boolean;
  outputLocation?: {
    bucket: string;
    key: string;
    url?: string;
    size: number;
  };
  error?: string;
  stats: {
    channelsExported: number;
    dmThreadsExported: number;
    messagesExported: number;
    attachmentsExported: number;
  };
}

function generateExportKey(jobId: string, tenantId: string | null): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const scope = tenantId ? `tenant-${tenantId}` : "all-tenants";
  return `chat-exports/${scope}/${timestamp}-${jobId}.jsonl`;
}

async function getMessagesForExport(
  tenantId: string | null,
  cutoffDate: Date | null,
  batchSize: number = 1000,
  offset: number = 0
): Promise<any[]> {
  let query = db
    .select({
      id: chatMessages.id,
      tenantId: chatMessages.tenantId,
      authorUserId: chatMessages.authorUserId,
      channelId: chatMessages.channelId,
      dmThreadId: chatMessages.dmThreadId,
      body: chatMessages.body,
      parentMessageId: chatMessages.parentMessageId,
      createdAt: chatMessages.createdAt,
      editedAt: chatMessages.editedAt,
      deletedAt: chatMessages.deletedAt,
      archivedAt: chatMessages.archivedAt,
      authorEmail: users.email,
      authorName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as('authorName'),
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.authorUserId, users.id))
    .orderBy(asc(chatMessages.createdAt))
    .limit(batchSize)
    .offset(offset);

  const conditions = [];
  if (tenantId) {
    conditions.push(eq(chatMessages.tenantId, tenantId));
  }
  if (cutoffDate) {
    conditions.push(lte(chatMessages.createdAt, cutoffDate));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query;
}

async function getChannelsForExport(tenantId: string | null): Promise<any[]> {
  let query = db
    .select({
      id: chatChannels.id,
      tenantId: chatChannels.tenantId,
      name: chatChannels.name,
      isPrivate: chatChannels.isPrivate,
      createdBy: chatChannels.createdBy,
      createdAt: chatChannels.createdAt,
    })
    .from(chatChannels);

  if (tenantId) {
    query = query.where(eq(chatChannels.tenantId, tenantId)) as typeof query;
  }

  return query;
}

async function getDmThreadsForExport(tenantId: string | null): Promise<any[]> {
  let query = db
    .select({
      id: chatDmThreads.id,
      tenantId: chatDmThreads.tenantId,
      createdAt: chatDmThreads.createdAt,
    })
    .from(chatDmThreads);

  if (tenantId) {
    query = query.where(eq(chatDmThreads.tenantId, tenantId)) as typeof query;
  }

  return query;
}

async function getAttachmentsForExport(tenantId: string | null, cutoffDate: Date | null): Promise<any[]> {
  let query = db
    .select({
      id: chatAttachments.id,
      tenantId: chatAttachments.tenantId,
      messageId: chatAttachments.messageId,
      fileName: chatAttachments.fileName,
      mimeType: chatAttachments.mimeType,
      sizeBytes: chatAttachments.sizeBytes,
      s3Key: chatAttachments.s3Key,
      url: chatAttachments.url,
      createdAt: chatAttachments.createdAt,
    })
    .from(chatAttachments)
    .leftJoin(chatMessages, eq(chatAttachments.messageId, chatMessages.id));

  const conditions = [];
  if (tenantId) {
    conditions.push(eq(chatAttachments.tenantId, tenantId));
  }
  if (cutoffDate) {
    conditions.push(lte(chatMessages.createdAt, cutoffDate));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query;
}

async function countMessages(tenantId: string | null, cutoffDate: Date | null): Promise<number> {
  const conditions = [];
  if (tenantId) {
    conditions.push(eq(chatMessages.tenantId, tenantId));
  }
  if (cutoffDate) {
    conditions.push(lte(chatMessages.createdAt, cutoffDate));
  }

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return result[0]?.count ?? 0;
}

export async function processChatExportJob(jobId: string): Promise<ExportResult> {
  const job = await IStorage.getChatExportJob(jobId);
  if (!job) {
    return { success: false, error: "Export job not found", stats: { channelsExported: 0, dmThreadsExported: 0, messagesExported: 0, attachmentsExported: 0 } };
  }

  if (!isR2Configured()) {
    await IStorage.updateChatExportJob(jobId, { 
      status: "failed", 
      error: "Cloudflare R2 storage is not configured",
      finishedAt: new Date()
    });
    return { success: false, error: "Cloudflare R2 storage is not configured", stats: { channelsExported: 0, dmThreadsExported: 0, messagesExported: 0, attachmentsExported: 0 } };
  }

  try {
    await IStorage.updateChatExportJob(jobId, { 
      status: "processing", 
      startedAt: new Date(),
      progress: { phase: "channels", processedMessages: 0, totalMessages: 0, processedChannels: 0, totalChannels: 0, processedDms: 0, totalDms: 0 } 
    });

    const tenantId = job.scopeType === "tenant" ? job.tenantId : null;
    const cutoffDate = job.cutoffDate ? new Date(job.cutoffDate) : null;

    const exportLines: string[] = [];

    const channels = await getChannelsForExport(tenantId);
    for (const channel of channels) {
      exportLines.push(JSON.stringify({ type: "channel", data: channel }));
    }

    await IStorage.updateChatExportJob(jobId, { 
      progress: { phase: "dms", processedMessages: 0, totalMessages: 0, processedChannels: channels.length, totalChannels: channels.length, processedDms: 0, totalDms: 0 } 
    });

    const dmThreads = await getDmThreadsForExport(tenantId);
    for (const dm of dmThreads) {
      exportLines.push(JSON.stringify({ type: "dm_thread", data: dm }));
    }

    await IStorage.updateChatExportJob(jobId, { 
      progress: { phase: "messages", processedMessages: 0, totalMessages: 0, processedChannels: channels.length, totalChannels: channels.length, processedDms: dmThreads.length, totalDms: dmThreads.length } 
    });

    const totalMessages = await countMessages(tenantId, cutoffDate);
    let processedMessages = 0;
    const batchSize = 1000;
    let offset = 0;

    while (true) {
      const messages = await getMessagesForExport(tenantId, cutoffDate, batchSize, offset);
      if (messages.length === 0) break;

      for (const msg of messages) {
        exportLines.push(JSON.stringify({ type: "message", data: msg }));
        processedMessages++;
      }

      await IStorage.updateChatExportJob(jobId, { 
        progress: { 
          phase: "messages", 
          processedMessages, 
          totalMessages, 
          processedChannels: channels.length, 
          totalChannels: channels.length, 
          processedDms: dmThreads.length, 
          totalDms: dmThreads.length 
        } 
      });

      offset += batchSize;
      if (messages.length < batchSize) break;
    }

    await IStorage.updateChatExportJob(jobId, { 
      progress: { phase: "attachments", processedMessages, totalMessages, processedChannels: channels.length, totalChannels: channels.length, processedDms: dmThreads.length, totalDms: dmThreads.length } 
    });

    const attachments = await getAttachmentsForExport(tenantId, cutoffDate);
    for (const attachment of attachments) {
      exportLines.push(JSON.stringify({ type: "attachment", data: attachment }));
    }

    await IStorage.updateChatExportJob(jobId, { 
      progress: { phase: "uploading", processedMessages, totalMessages, processedChannels: channels.length, totalChannels: channels.length, processedDms: dmThreads.length, totalDms: dmThreads.length } 
    });

    const jsonlContent = exportLines.join("\n");
    const buffer = Buffer.from(jsonlContent, "utf-8");
    const storageKey = generateExportKey(jobId, tenantId);

    await uploadToS3(buffer, storageKey, "application/x-ndjson", tenantId);

    const outputLocation = {
      bucket: process.env.CF_R2_BUCKET_NAME || "unknown",
      key: storageKey,
      size: buffer.length,
    };

    await IStorage.updateChatExportJob(jobId, { 
      status: "completed",
      outputLocation,
      finishedAt: new Date(),
      progress: { phase: "done", processedMessages, totalMessages, processedChannels: channels.length, totalChannels: channels.length, processedDms: dmThreads.length, totalDms: dmThreads.length }
    });

    return {
      success: true,
      outputLocation,
      stats: {
        channelsExported: channels.length,
        dmThreadsExported: dmThreads.length,
        messagesExported: processedMessages,
        attachmentsExported: attachments.length,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    await IStorage.updateChatExportJob(jobId, { 
      status: "failed", 
      error: errorMessage,
      finishedAt: new Date()
    });
    return { 
      success: false, 
      error: errorMessage, 
      stats: { channelsExported: 0, dmThreadsExported: 0, messagesExported: 0, attachmentsExported: 0 } 
    };
  }
}

export async function startChatExport(
  requestedByUserId: string,
  options: {
    scopeType: "tenant" | "all";
    tenantId?: string;
    cutoffType: "date" | "retention";
    cutoffDate?: Date;
    retainDays?: number;
    includeAttachmentFiles?: boolean;
  }
): Promise<ChatExportJob> {
  let cutoffDate = options.cutoffDate;
  if (options.cutoffType === "retention" && options.retainDays) {
    cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.retainDays);
  }

  const job = await IStorage.createChatExportJob({
    requestedByUserId,
    scopeType: options.scopeType,
    tenantId: options.scopeType === "tenant" ? options.tenantId : null,
    cutoffType: options.cutoffType,
    cutoffDate,
    retainDays: options.retainDays,
    includeAttachmentFiles: options.includeAttachmentFiles || false,
    format: "jsonl",
    status: "queued",
  });

  setTimeout(() => {
    processChatExportJob(job.id).catch((err) => {
      console.error("[chatExport] Background processing error:", err);
    });
  }, 100);

  return job;
}
