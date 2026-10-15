/**
 * Assignment emails for interactive internal task routes.
 * Tenancy: assignment, recipient and project must belong to the effective tenant.
 * Assignment and delivery intent commit together; other notifications are untouched.
 */
import type { Request } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  backgroundJobs, emailOutbox, notificationPreferences, projects, subtasks,
  subtaskAssignees, taskAssignees, tasks, users,
} from "@shared/schema";
import { AppError } from "../lib/errors";
import { isSuperUserRole } from "@shared/roles";
import { buildTaskUrl } from "../lib/appLinks";
import { canViewTask, canViewProject } from "../lib/privateVisibility";
import { emailOutboxService } from "./emailOutbox";
import { emailTemplateService } from "./emailTemplates";
import type { JobContext } from "../jobs/queue";

export const ASSIGNMENT_EMAIL_JOB = "assignment_email";
type Reader = Pick<typeof db, "select">;
type LinkRequest = Pick<Request, "protocol" | "get">;
interface AssignmentInput {
  taskId: string;
  userId: string;
  actorUserId: string;
  tenantId?: string | null;
  subtaskId?: string;
  setPrimaryAssignee?: boolean;
}

async function emailContext(reader: Reader, input: AssignmentInput) {
  const [task] = await reader.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!task?.tenantId || !task.projectId || task.isPersonal || input.userId === input.actorUserId) return null;
  if (input.tenantId !== task.tenantId) return null;
  const [project] = await reader.select().from(projects).where(and(
    eq(projects.id, task.projectId), eq(projects.tenantId, task.tenantId),
  )).limit(1);
  if (!project?.assignmentEmailsEnabled) return null;
  const [recipient] = await reader.select().from(users).where(and(
    eq(users.id, input.userId), eq(users.tenantId, task.tenantId),
  )).limit(1);
  const [actor] = await reader.select().from(users).where(eq(users.id, input.actorUserId)).limit(1);
  if (!recipient?.isActive || !recipient.email || !actor) return null;
  if (actor.tenantId !== task.tenantId && !isSuperUserRole(actor.role)) return null;
  const [prefs] = await reader.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, recipient.id)).limit(1);
  // This flag controls assignment emails only; other notification channels are untouched.
  if (prefs?.emailEnabled !== true) return null;
  let title = task.title;
  let dueDate = task.dueDate;
  if (input.subtaskId) {
    const [subtask] = await reader.select().from(subtasks).where(and(
      eq(subtasks.id, input.subtaskId), eq(subtasks.taskId, task.id),
    )).limit(1);
    if (!subtask) return null;
    title = subtask.title;
    dueDate = subtask.dueDate;
  }
  return { task, project, recipient, actor, title, dueDate };
}

// Called only by interactive assignment routes. Imports and bulk operations keep
// their existing storage paths. The assignment and delivery intent commit together.
export async function assignTaskWithEmail(input: AssignmentInput, req?: LinkRequest) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
    const [recipient] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!task || (input.tenantId && task.tenantId !== input.tenantId)) throw AppError.notFound("Task");
    if (!recipient || (task.tenantId && recipient.tenantId !== task.tenantId)) {
      throw AppError.forbidden("User is not in the same organization");
    }
    const table = input.subtaskId ? subtaskAssignees : taskAssignees;
    let alreadyPrimaryAssignee = false;
    if (input.subtaskId) {
      const [subtask] = await tx.select().from(subtasks).where(and(
        eq(subtasks.id, input.subtaskId), eq(subtasks.taskId, task.id),
      )).limit(1);
      if (!subtask) throw AppError.notFound("Subtask");
      alreadyPrimaryAssignee = subtask.assigneeId === input.userId;
    }
    const values = input.subtaskId
      ? { subtaskId: input.subtaskId, userId: input.userId, tenantId: task.tenantId }
      : { taskId: task.id, userId: input.userId, tenantId: task.tenantId };
    const [created] = await tx.insert(table).values(values).onConflictDoNothing().returning();
    if (input.subtaskId) {
      // Preserve the legacy primary-assignee field used by lists and review queues.
      await tx.update(subtasks).set({ assigneeId: input.userId, updatedAt: new Date() }).where(and(
        eq(subtasks.id, input.subtaskId),
        input.setPrimaryAssignee ? undefined : isNull(subtasks.assigneeId),
      ));
    }
    if (!created) {
      const entityCondition = input.subtaskId
        ? eq(subtaskAssignees.subtaskId, input.subtaskId) : eq(taskAssignees.taskId, task.id);
      const [existing] = await tx.select().from(table)
        .where(and(entityCondition, eq(table.userId, input.userId))).limit(1);
      return { assignment: existing, created: false };
    }
    const context = await emailContext(tx, input);
    if (context && !alreadyPrimaryAssignee) {
      await tx.insert(backgroundJobs).values({
        tenantId: context.task.tenantId!, createdByUserId: input.actorUserId,
        type: ASSIGNMENT_EMAIL_JOB, maxAttempts: 3,
        payload: {
          ...input, tenantId: context.task.tenantId, assignmentId: created.id,
          actionUrl: buildTaskUrl({ taskId: task.id, projectId: context.project.id, subtaskId: input.subtaskId }, req),
        },
      });
    }
    return { assignment: created, created: true };
  });
}

export async function assignSubtaskWithEmail(input: Omit<AssignmentInput, "taskId"> & { subtaskId: string }, req?: LinkRequest) {
  const [subtask] = await db.select().from(subtasks).where(eq(subtasks.id, input.subtaskId)).limit(1);
  if (!subtask) throw AppError.notFound("Subtask");
  return assignTaskWithEmail({ ...input, taskId: subtask.taskId }, req);
}

export async function deliverAssignmentEmail(ctx: JobContext): Promise<void> {
  const input = { ...ctx.payload, tenantId: ctx.tenantId, actorUserId: ctx.userId } as AssignmentInput & { assignmentId: string };
  const context = await emailContext(db, input);
  if (!context) return;
  if (!(await canViewTask(ctx.tenantId, input.taskId, input.userId)) ||
      !(await canViewProject(ctx.tenantId, context.project.id, input.userId))) return;
  const table = input.subtaskId ? subtaskAssignees : taskAssignees;
  const [assignment] = await db.select().from(table).where(and(
    eq(table.id, input.assignmentId), eq(table.userId, input.userId),
    input.subtaskId ? eq(subtaskAssignees.subtaskId, input.subtaskId) : eq(taskAssignees.taskId, input.taskId),
  )).limit(1);
  if (!assignment) return; // Removed assignments, including remove/re-add, cancel old jobs.
  const [sent] = await db.select({ id: emailOutbox.id }).from(emailOutbox).where(and(
    eq(emailOutbox.tenantId, ctx.tenantId), eq(emailOutbox.messageType, "task_assignment"),
    eq(emailOutbox.status, "sent"), sql`${emailOutbox.metadata}->>'assignmentJobId' = ${ctx.jobId}`,
  )).limit(1);
  if (sent) return;
  const actionUrl = ctx.payload.actionUrl || buildTaskUrl({ taskId: input.taskId, projectId: context.project.id, subtaskId: input.subtaskId });
  const rendered = await emailTemplateService.renderByKey(ctx.tenantId, "task_assignment", {
    userName: context.recipient.name || context.recipient.email,
    assignedByName: context.actor.name || context.actor.email,
    taskTitle: context.title, projectName: context.project.name,
    dueDate: context.dueDate?.toISOString().slice(0, 10) || "No due date",
    actionUrl, actionLabel: input.subtaskId ? "View Subtask" : "View Task", appName: "Digital Workday",
  }, true);
  const result = await emailOutboxService.sendEmail({
    tenantId: ctx.tenantId, requestId: ctx.jobId, messageType: "task_assignment", toEmail: context.recipient.email,
    subject: rendered?.subject || `You've been assigned to: ${context.title}`,
    textBody: rendered?.textBody || `${context.actor.name || context.actor.email} assigned you: ${context.title}`,
    htmlBody: rendered?.htmlBody, actionUrl, actionLabel: "View Task",
    metadata: { assignmentJobId: ctx.jobId, assignmentId: input.assignmentId, taskId: input.taskId, subtaskId: input.subtaskId },
  });
  if (!result.success) throw new Error(result.error || "Assignment email delivery failed");
}
