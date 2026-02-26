import { db } from "../db";
import { tasks, chatMessages, dataRetentionPolicies, tenants } from "@shared/schema";
import { eq, and, isNull, isNotNull, lt, count } from "drizzle-orm";

export interface RetentionAuditSummary {
  tenantId: string;
  tenantName: string;
  policies: any[];
  tasks: {
    total: number;
    eligibleForArchive: number;
    alreadyArchived: number;
  };
  chatMessages: {
    total: number;
    eligibleForArchive: number;
    alreadyArchived: number;
  };
}

export async function getRetentionAuditSummary(tenantId: string): Promise<RetentionAuditSummary> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Tenant not found");

  const policies = await db.select().from(dataRetentionPolicies).where(eq(dataRetentionPolicies.tenantId, tenantId));

  // Task stats
  const [taskTotal] = await db.select({ value: count() }).from(tasks).where(eq(tasks.tenantId, tenantId));
  const [taskArchived] = await db.select({ value: count() }).from(tasks).where(and(eq(tasks.tenantId, tenantId), isNotNull(tasks.archivedAt)));

  // Policy lookup
  const taskPolicy = policies.find(p => p.entityType === "tasks");
  const taskRetentionDays = taskPolicy?.retentionDays ?? 30;

  const taskCutoff = new Date();
  taskCutoff.setDate(taskCutoff.getDate() - taskRetentionDays);

  const [taskEligible] = await db.select({ value: count() }).from(tasks).where(
    and(
      eq(tasks.tenantId, tenantId),
      eq(tasks.status, "done"),
      isNull(tasks.archivedAt),
      lt(tasks.updatedAt, taskCutoff)
    )
  );

  // Chat stats
  const [chatTotal] = await db.select({ value: count() }).from(chatMessages).where(eq(chatMessages.tenantId, tenantId));
  const [chatArchived] = await db.select({ value: count() }).from(chatMessages).where(and(eq(chatMessages.tenantId, tenantId), sql`archived_at IS NOT NULL`));
  
  const chatPolicy = policies.find(p => p.entityType === "chat_messages");
  const chatRetentionDays = chatPolicy?.retentionDays ?? 30;
  const chatCutoff = new Date();
  chatCutoff.setDate(chatCutoff.getDate() - chatRetentionDays);

  const [chatEligible] = await db.select({ value: count() }).from(chatMessages).where(
    and(
      eq(chatMessages.tenantId, tenantId),
      isNull(chatMessages.archivedAt),
      lt(chatMessages.createdAt, chatCutoff)
    )
  );

  return {
    tenantId,
    tenantName: tenant.name,
    policies,
    tasks: {
      total: taskTotal.value,
      eligibleForArchive: taskEligible.value,
      alreadyArchived: taskArchived.value,
    },
    chatMessages: {
      total: chatTotal.value,
      eligibleForArchive: chatEligible.value,
      alreadyArchived: chatArchived.value,
    },
  };
}

export async function getAllTenantsAuditSummary(): Promise<RetentionAuditSummary[]> {
  const allTenants = await db.select().from(tenants);
  const summaries = await Promise.all(allTenants.map(t => getRetentionAuditSummary(t.id)));
  return summaries;
}
