import { db } from "../db";
import { tasks, chatMessages, dataRetentionPolicies } from "@shared/schema";
import { eq, and, isNull, lt } from "drizzle-orm";

export interface ArchiveResult {
  tenantId: string;
  tasksArchived: number;
  messagesArchived: number;
  errors: string[];
}

export async function runSoftArchive(tenantId: string): Promise<ArchiveResult> {
  const result: ArchiveResult = {
    tenantId,
    tasksArchived: 0,
    messagesArchived: 0,
    errors: [],
  };

  try {
    const policies = await db.select().from(dataRetentionPolicies).where(eq(dataRetentionPolicies.tenantId, tenantId));
    
    const taskPolicy = policies.find(p => p.entityType === "tasks");
    const chatPolicy = policies.find(p => p.entityType === "chat_messages");

    const now = new Date();

    // Archive Tasks
    if (taskPolicy?.isEnabled) {
      const taskCutoff = new Date(now.getTime() - taskPolicy.retentionDays * 24 * 60 * 60 * 1000);
      const archivedTasks = await db.update(tasks)
        .set({ 
          archivedAt: now,
          archivedReason: `Retention policy: ${taskPolicy.retentionDays} days`
        } as any)
        .where(and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.status, "done"),
          isNull(tasks.archivedAt),
          lt(tasks.updatedAt, taskCutoff)
        ))
        .returning({ id: tasks.id });
      
      result.tasksArchived = archivedTasks.length;
    }

    // Archive Chat Messages
    if (chatPolicy?.isEnabled) {
      const chatCutoff = new Date(now.getTime() - chatPolicy.retentionDays * 24 * 60 * 60 * 1000);
      const archivedMessages = await db.update(chatMessages)
        .set({ 
          archivedAt: now,
        })
        .where(and(
          eq(chatMessages.tenantId, tenantId),
          isNull(chatMessages.archivedAt),
          lt(chatMessages.createdAt, chatCutoff)
        ))
        .returning({ id: chatMessages.id });

      result.messagesArchived = archivedMessages.length;
    }

  } catch (err: any) {
    result.errors.push(err.message || String(err));
  }

  return result;
}
