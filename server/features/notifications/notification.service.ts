import { storage } from "../../storage";
import { emitNotificationNew } from "../../realtime/events";
import type { NotificationPayload } from "@shared/events";
import { db } from "../../db";
import { clientCrm, clients } from "@shared/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";

type NotificationType = 
  | "task_deadline"
  | "task_assigned"
  | "task_completed"
  | "comment_added"
  | "comment_mention"
  | "project_update"
  | "project_member_added"
  | "task_status_changed"
  | "crm_followup_due"
  | "approval_response";

interface NotificationContext {
  tenantId: string | null;
  excludeUserId?: string;
}

// Validate that target user belongs to the same tenant (critical for multi-tenant isolation)
async function validateUserTenant(userId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) {
    // No tenant context means super user scope - allow notification
    return true;
  }
  
  try {
    const user = await storage.getUser(userId);
    if (!user) return false;
    return user.tenantId === tenantId;
  } catch {
    return false;
  }
}

async function shouldNotifyUser(userId: string, type: NotificationType): Promise<boolean> {
  try {
    const prefs = await storage.getNotificationPreferences(userId);
    
    // If no preferences exist, default to sending notifications
    if (!prefs) {
      return true;
    }
    
    const typeToField: Record<NotificationType, keyof typeof prefs | null> = {
      task_deadline: "taskDeadline",
      task_assigned: "taskAssigned",
      task_completed: "taskCompleted",
      comment_added: "commentAdded",
      comment_mention: "commentMention",
      project_update: "projectUpdate",
      project_member_added: "projectMemberAdded",
      task_status_changed: "taskStatusChanged",
      crm_followup_due: null,
      approval_response: null,
    };
    const field = typeToField[type];
    if (!field) return true;
    // Default to true if preference is not explicitly set to false
    return prefs[field] !== false;
  } catch {
    // On any error, default to sending notifications
    return true;
  }
}

async function createAndEmitNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string | null,
  payloadJson: unknown,
  context: NotificationContext
): Promise<void> {
  if (context.excludeUserId === userId) {
    return;
  }
  
  // Validate tenant isolation - user must belong to same tenant
  const isSameTenant = await validateUserTenant(userId, context.tenantId);
  if (!isSameTenant) {
    console.warn(`[notifications] Blocked notification to user ${userId} - tenant mismatch`);
    return;
  }
  
  const shouldNotify = await shouldNotifyUser(userId, type);
  if (!shouldNotify) {
    return;
  }

  const notification = await storage.createNotification({
    tenantId: context.tenantId,
    userId,
    type,
    title,
    message,
    payloadJson: payloadJson as Record<string, unknown>,
  });

  const payload: NotificationPayload = {
    id: notification.id,
    tenantId: notification.tenantId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    payloadJson: notification.payloadJson,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };

  emitNotificationNew(userId, payload);
}

export async function notifyTaskAssigned(
  assigneeId: string,
  taskId: string,
  taskTitle: string,
  assignerName: string,
  projectName: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    assigneeId,
    "task_assigned",
    `New task assigned: ${taskTitle}`,
    `${assignerName} assigned you a task in ${projectName}`,
    { taskId, projectName },
    context
  );
}

export async function notifyTaskCompleted(
  userId: string,
  taskId: string,
  taskTitle: string,
  completedByName: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "task_completed",
    `Task completed: ${taskTitle}`,
    `${completedByName} completed this task`,
    { taskId },
    context
  );
}

export async function notifyTaskStatusChanged(
  userId: string,
  taskId: string,
  taskTitle: string,
  newStatus: string,
  changedByName: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "task_status_changed",
    `Status changed: ${taskTitle}`,
    `${changedByName} changed status to ${newStatus}`,
    { taskId, status: newStatus },
    context
  );
}

export async function notifyCommentAdded(
  userId: string,
  taskId: string,
  taskTitle: string,
  commenterName: string,
  commentPreview: string,
  context: NotificationContext
): Promise<void> {
  const preview = commentPreview.length > 100 
    ? commentPreview.slice(0, 100) + "..." 
    : commentPreview;
  
  await createAndEmitNotification(
    userId,
    "comment_added",
    `New comment on: ${taskTitle}`,
    `${commenterName}: ${preview}`,
    { taskId },
    context
  );
}

export async function notifyCommentMention(
  userId: string,
  taskId: string,
  taskTitle: string,
  mentionerName: string,
  commentPreview: string,
  context: NotificationContext
): Promise<void> {
  const preview = commentPreview.length > 100 
    ? commentPreview.slice(0, 100) + "..." 
    : commentPreview;
  
  await createAndEmitNotification(
    userId,
    "comment_mention",
    `${mentionerName} mentioned you`,
    `In task "${taskTitle}": ${preview}`,
    { taskId },
    context
  );
}

export async function notifyProjectMemberAdded(
  userId: string,
  projectId: string,
  projectName: string,
  addedByName: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "project_member_added",
    `Added to project: ${projectName}`,
    `${addedByName} added you to this project`,
    { projectId },
    context
  );
}

export async function notifyProjectUpdate(
  userId: string,
  projectId: string,
  projectName: string,
  updateDescription: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "project_update",
    `Project update: ${projectName}`,
    updateDescription,
    { projectId },
    context
  );
}

export async function notifyTaskDeadlineApproaching(
  userId: string,
  taskId: string,
  taskTitle: string,
  dueDate: Date,
  context: NotificationContext
): Promise<void> {
  const dueDateStr = dueDate.toLocaleDateString();
  await createAndEmitNotification(
    userId,
    "task_deadline",
    `Task due soon: ${taskTitle}`,
    `This task is due on ${dueDateStr}`,
    { taskId, dueDate: dueDate.toISOString() },
    context
  );
}

export async function notifyFollowUpDue(
  userId: string,
  clientId: string,
  clientName: string,
  followUpDate: Date,
  context: NotificationContext
): Promise<void> {
  const dueDateStr = followUpDate.toLocaleDateString();
  await createAndEmitNotification(
    userId,
    "crm_followup_due",
    `Follow-up due: ${clientName}`,
    `Client follow-up is due on ${dueDateStr}`,
    { clientId, followUpDate: followUpDate.toISOString() },
    context
  );
}

// Check for upcoming task deadlines and send notifications
// This should be called periodically (e.g., daily) by a scheduler
export async function checkUpcomingDeadlines(): Promise<void> {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    // Get all tasks with due dates within the next 24 hours
    const upcomingTasks = await storage.getTasksDueSoon(tomorrow);
    
    for (const task of upcomingTasks) {
      if (!task.dueDate || task.status === "completed") continue;
      
      const assignees = await storage.getTaskAssignees(task.id);
      const context: NotificationContext = { 
        tenantId: task.tenantId || null 
      };
      
      for (const assignee of assignees) {
        await notifyTaskDeadlineApproaching(
          assignee.userId,
          task.id,
          task.title,
          new Date(task.dueDate),
          context
        );
      }
    }
    
    console.log(`[deadline-checker] Checked ${upcomingTasks.length} tasks with upcoming deadlines`);
  } catch (error) {
    console.error("[deadline-checker] Error checking deadlines:", error);
  }
}

// Start the deadline checker interval (runs every 6 hours)
let deadlineCheckerInterval: NodeJS.Timeout | null = null;

export function startDeadlineChecker(): void {
  if (deadlineCheckerInterval) {
    clearInterval(deadlineCheckerInterval);
  }
  
  // Run once on startup (after a short delay)
  setTimeout(() => {
    checkUpcomingDeadlines().catch(console.error);
  }, 10000);
  
  // Then run every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  deadlineCheckerInterval = setInterval(() => {
    checkUpcomingDeadlines().catch(console.error);
  }, SIX_HOURS);
  
  console.log("[deadline-checker] Started deadline notification checker");
}

export function stopDeadlineChecker(): void {
  if (deadlineCheckerInterval) {
    clearInterval(deadlineCheckerInterval);
    deadlineCheckerInterval = null;
  }
}

export async function checkFollowUpsDue(): Promise<void> {
  try {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const dueFollowUps = await db
      .select({
        clientId: clientCrm.clientId,
        tenantId: clientCrm.tenantId,
        ownerUserId: clientCrm.ownerUserId,
        nextFollowUpAt: clientCrm.nextFollowUpAt,
        companyName: clients.companyName,
        displayName: clients.displayName,
      })
      .from(clientCrm)
      .innerJoin(clients, eq(clients.id, clientCrm.clientId))
      .where(
        and(
          isNotNull(clientCrm.nextFollowUpAt),
          lte(clientCrm.nextFollowUpAt, endOfToday),
          isNotNull(clientCrm.ownerUserId)
        )
      );

    let notifiedCount = 0;
    for (const row of dueFollowUps) {
      if (!row.ownerUserId || !row.nextFollowUpAt) continue;

      const clientName = row.displayName || row.companyName || "Unknown Client";
      const context = { tenantId: row.tenantId };

      await notifyFollowUpDue(
        row.ownerUserId,
        row.clientId,
        clientName,
        new Date(row.nextFollowUpAt),
        context
      );
      notifiedCount++;
    }

    console.log(`[followup-checker] Checked ${dueFollowUps.length} follow-ups, notified ${notifiedCount} owners`);
  } catch (error) {
    console.error("[followup-checker] Error checking follow-ups:", error);
  }
}

let followUpCheckerInterval: NodeJS.Timeout | null = null;

export async function notifyApprovalResponse(
  requestedByUserId: string,
  approvalId: string,
  approvalTitle: string,
  status: string,
  respondedByName: string,
  context: NotificationContext
): Promise<void> {
  const statusLabel = status === "approved" ? "Approved" : "Changes Requested";
  await createAndEmitNotification(
    requestedByUserId,
    "approval_response",
    `Approval ${statusLabel}: ${approvalTitle}`,
    `${respondedByName} ${status === "approved" ? "approved" : "requested changes on"} "${approvalTitle}"`,
    { approvalId, status },
    context
  );
}

export function startFollowUpChecker(): void {
  if (followUpCheckerInterval) {
    clearInterval(followUpCheckerInterval);
  }

  setTimeout(() => {
    checkFollowUpsDue().catch(console.error);
  }, 15000);

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  followUpCheckerInterval = setInterval(() => {
    checkFollowUpsDue().catch(console.error);
  }, SIX_HOURS);

  console.log("[followup-checker] Started follow-up notification checker");
}

export function stopFollowUpChecker(): void {
  if (followUpCheckerInterval) {
    clearInterval(followUpCheckerInterval);
    followUpCheckerInterval = null;
  }
}
