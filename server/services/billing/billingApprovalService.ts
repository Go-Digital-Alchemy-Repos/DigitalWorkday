import { db } from "../../db";
import { timeEntries, users, tasks, projects } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { AppError } from "../../lib/errors";

export type BillingStatus = "draft" | "pending_approval" | "approved" | "rejected" | "invoiced";

export interface PendingApprovalEntry {
  id: string;
  tenantId: string | null;
  userId: string;
  employeeName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  durationSeconds: number;
  startTime: Date;
  billingStatus: string;
  scope: string;
}

export async function submitTimeForApproval(
  timeEntryIds: string[],
  tenantId: string
): Promise<{ updated: number }> {
  if (!timeEntryIds.length) throw new AppError(400, "No time entry IDs provided");

  const entries = await db
    .select({ id: timeEntries.id, billingStatus: timeEntries.billingStatus, tenantId: timeEntries.tenantId })
    .from(timeEntries)
    .where(and(inArray(timeEntries.id, timeEntryIds), eq(timeEntries.tenantId, tenantId)));

  if (!entries.length) throw new AppError(404, "No matching time entries found");

  const eligible = entries.filter(
    (e) => e.billingStatus === "draft" || e.billingStatus === "rejected"
  );

  if (!eligible.length) {
    throw new AppError(400, "No entries eligible for approval submission (must be draft or rejected)");
  }

  const eligibleIds = eligible.map((e) => e.id);

  await db
    .update(timeEntries)
    .set({ billingStatus: "pending_approval", updatedAt: new Date() })
    .where(and(inArray(timeEntries.id, eligibleIds), eq(timeEntries.tenantId, tenantId)));

  return { updated: eligibleIds.length };
}

export async function approveTimeEntries(
  timeEntryIds: string[],
  tenantId: string
): Promise<{ updated: number }> {
  if (!timeEntryIds.length) throw new AppError(400, "No time entry IDs provided");

  const result = await db
    .update(timeEntries)
    .set({ billingStatus: "approved", updatedAt: new Date() })
    .where(
      and(
        inArray(timeEntries.id, timeEntryIds),
        eq(timeEntries.tenantId, tenantId),
        eq(timeEntries.billingStatus, "pending_approval")
      )
    );

  return { updated: (result as any).rowCount ?? timeEntryIds.length };
}

export async function rejectTimeEntries(
  timeEntryIds: string[],
  tenantId: string
): Promise<{ updated: number }> {
  if (!timeEntryIds.length) throw new AppError(400, "No time entry IDs provided");

  const result = await db
    .update(timeEntries)
    .set({ billingStatus: "rejected", updatedAt: new Date() })
    .where(
      and(
        inArray(timeEntries.id, timeEntryIds),
        eq(timeEntries.tenantId, tenantId),
        eq(timeEntries.billingStatus, "pending_approval")
      )
    );

  return { updated: (result as any).rowCount ?? timeEntryIds.length };
}

export async function getPendingApprovalQueue(
  tenantId: string
): Promise<PendingApprovalEntry[]> {
  const rows = await db
    .select({
      id: timeEntries.id,
      tenantId: timeEntries.tenantId,
      userId: timeEntries.userId,
      employeeName: sql<string | null>`concat(${users.firstName}, ' ', ${users.lastName})`,
      taskId: timeEntries.taskId,
      taskTitle: tasks.title,
      projectId: timeEntries.projectId,
      projectName: projects.name,
      durationSeconds: timeEntries.durationSeconds,
      startTime: timeEntries.startTime,
      billingStatus: timeEntries.billingStatus,
      scope: timeEntries.scope,
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(timeEntries.tenantId, tenantId),
        eq(timeEntries.billingStatus, "pending_approval")
      )
    )
    .orderBy(timeEntries.startTime);

  return rows as PendingApprovalEntry[];
}
