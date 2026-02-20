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
  | "approval_response"
  | "chat_message"
  | "client_message"
  | "support_ticket"
  | "work_order";

type Severity = "info" | "warning" | "urgent";

interface NotificationContext {
  tenantId: string | null;
  excludeUserId?: string;
}

interface EnhancedNotificationOptions {
  severity?: Severity;
  entityType?: string;
  entityId?: string;
  href?: string;
  dedupeKey?: string;
}

async function validateUserTenant(userId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) {
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
      chat_message: "chatMessage",
      client_message: "clientMessage",
      support_ticket: "supportTicket",
      work_order: "workOrder",
      crm_followup_due: null,
      approval_response: null,
    };
    const field = typeToField[type];
    if (!field) return true;
    return prefs[field] !== false;
  } catch {
    return true;
  }
}

async function createAndEmitNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string | null,
  payloadJson: unknown,
  context: NotificationContext,
  options?: EnhancedNotificationOptions
): Promise<void> {
  if (context.excludeUserId === userId) {
    return;
  }
  
  const isSameTenant = await validateUserTenant(userId, context.tenantId);
  if (!isSameTenant) {
    console.warn(`[notifications] Blocked notification to user ${userId} - tenant mismatch`);
    return;
  }
  
  const shouldNotify = await shouldNotifyUser(userId, type);
  if (!shouldNotify) {
    return;
  }

  const insertData = {
    tenantId: context.tenantId,
    userId,
    type,
    title,
    message,
    payloadJson: payloadJson as Record<string, unknown>,
    severity: options?.severity || "info",
    entityType: options?.entityType || null,
    entityId: options?.entityId || null,
    href: options?.href || null,
    dedupeKey: options?.dedupeKey || null,
  };

  const notification = options?.dedupeKey
    ? await storage.createOrDedupeNotification(insertData)
    : await storage.createNotification(insertData);

  const payload: NotificationPayload = {
    id: notification.id,
    tenantId: notification.tenantId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    payloadJson: notification.payloadJson,
    severity: notification.severity,
    entityType: notification.entityType,
    entityId: notification.entityId,
    href: notification.href,
    isDismissed: notification.isDismissed,
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
    context,
    { entityType: "task", entityId: taskId, href: `/tasks?taskId=${taskId}` }
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
    context,
    { entityType: "task", entityId: taskId, href: `/tasks?taskId=${taskId}` }
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
    context,
    { entityType: "task", entityId: taskId, href: `/tasks?taskId=${taskId}` }
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
    context,
    { entityType: "task", entityId: taskId, href: `/tasks?taskId=${taskId}` }
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
    context,
    { entityType: "task", entityId: taskId, href: `/tasks?taskId=${taskId}`, severity: "warning" }
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
    context,
    { entityType: "project", entityId: projectId, href: `/projects/${projectId}` }
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
    context,
    { entityType: "project", entityId: projectId, href: `/projects/${projectId}` }
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
    context,
    {
      severity: "warning",
      entityType: "task",
      entityId: taskId,
      href: `/tasks?taskId=${taskId}`,
      dedupeKey: `deadline:${taskId}`,
    }
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
    context,
    {
      severity: "warning",
      entityType: "client",
      entityId: clientId,
      href: `/clients/${clientId}`,
      dedupeKey: `followup:${clientId}`,
    }
  );
}

export async function notifyChatMessage(
  userId: string,
  channelId: string,
  channelName: string,
  senderName: string,
  messagePreview: string,
  context: NotificationContext
): Promise<void> {
  const preview = messagePreview.length > 80
    ? messagePreview.slice(0, 80) + "..."
    : messagePreview;

  await createAndEmitNotification(
    userId,
    "chat_message",
    `New message in #${channelName}`,
    `${senderName}: ${preview}`,
    { channelId },
    context,
    {
      entityType: "channel",
      entityId: channelId,
      href: `/chat?channel=${channelId}`,
      dedupeKey: `chat:${channelId}`,
    }
  );
}

export async function notifyDirectMessage(
  userId: string,
  senderId: string,
  senderName: string,
  messagePreview: string,
  context: NotificationContext
): Promise<void> {
  const preview = messagePreview.length > 80
    ? messagePreview.slice(0, 80) + "..."
    : messagePreview;

  await createAndEmitNotification(
    userId,
    "chat_message",
    `New message from ${senderName}`,
    preview,
    { senderId },
    context,
    {
      entityType: "dm",
      entityId: senderId,
      href: `/chat?dm=${senderId}`,
      dedupeKey: `dm:${senderId}`,
    }
  );
}

export async function notifyClientMessage(
  userId: string,
  clientId: string,
  clientName: string,
  threadId: string,
  messagePreview: string,
  context: NotificationContext
): Promise<void> {
  const preview = messagePreview.length > 80
    ? messagePreview.slice(0, 80) + "..."
    : messagePreview;

  await createAndEmitNotification(
    userId,
    "client_message",
    `Client message from ${clientName}`,
    preview,
    { clientId, threadId },
    context,
    {
      entityType: "client_thread",
      entityId: threadId,
      href: `/clients/${clientId}/messages?thread=${threadId}`,
      dedupeKey: `client_msg:${threadId}`,
    }
  );
}

export async function notifySupportTicketCreated(
  userId: string,
  ticketId: string,
  ticketTitle: string,
  submittedByName: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "support_ticket",
    `New support ticket: ${ticketTitle}`,
    `Submitted by ${submittedByName}`,
    { ticketId },
    context,
    {
      entityType: "support_ticket",
      entityId: ticketId,
      href: `/support/tickets/${ticketId}`,
    }
  );
}

export async function notifySupportTicketUpdated(
  userId: string,
  ticketId: string,
  ticketTitle: string,
  updatedByName: string,
  updateDescription: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "support_ticket",
    `Ticket updated: ${ticketTitle}`,
    `${updatedByName}: ${updateDescription}`,
    { ticketId },
    context,
    {
      entityType: "support_ticket",
      entityId: ticketId,
      href: `/support/tickets/${ticketId}`,
      dedupeKey: `ticket:${ticketId}`,
    }
  );
}

export async function notifySupportTicketAssigned(
  userId: string,
  ticketId: string,
  ticketTitle: string,
  assignedByName: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "support_ticket",
    `Ticket assigned to you: ${ticketTitle}`,
    `${assignedByName} assigned this ticket to you`,
    { ticketId },
    context,
    {
      severity: "warning",
      entityType: "support_ticket",
      entityId: ticketId,
      href: `/support/tickets/${ticketId}`,
    }
  );
}

export async function notifyWorkOrderCreated(
  userId: string,
  workOrderId: string,
  workOrderTitle: string,
  createdByName: string,
  context: NotificationContext
): Promise<void> {
  await createAndEmitNotification(
    userId,
    "work_order",
    `New work order: ${workOrderTitle}`,
    `Created by ${createdByName}`,
    { workOrderId },
    context,
    {
      entityType: "work_order",
      entityId: workOrderId,
      href: `/support/work-orders/${workOrderId}`,
    }
  );
}

export async function checkUpcomingDeadlines(): Promise<void> {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
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

let deadlineCheckerInterval: NodeJS.Timeout | null = null;

export function startDeadlineChecker(): void {
  if (deadlineCheckerInterval) {
    clearInterval(deadlineCheckerInterval);
  }
  
  setTimeout(() => {
    checkUpcomingDeadlines().catch(console.error);
  }, 10000);
  
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
    context,
    { entityType: "approval", entityId: approvalId }
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
