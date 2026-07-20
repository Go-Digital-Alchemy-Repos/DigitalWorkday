import { createApiRouter } from "../routerFactory";
import { storage } from "../../storage";
import { handleRouteError } from "../../lib/errors";
import { getCurrentUserId } from "../helpers";
import { insertActivityLogSchema, tasks, subtasks, comments, timeEntries, users } from "@shared/schema";
import { db } from "../../db";
import { and, desc, eq, inArray } from "drizzle-orm";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

type HistoryItem = {
  id: string;
  type: string;
  timestamp: string | Date;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorAvatarUrl: string | null;
  entityId: string;
  entityTitle: string;
  metadata?: Record<string, unknown>;
};

function toSafeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getUserLabel(user?: { name: string | null; firstName: string | null; lastName: string | null; email: string | null }) {
  if (!user) return "Unknown";
  if (user.name?.trim()) return user.name.trim();
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return fullName || user.email || "Unknown";
}

async function getUsersByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string | null; avatarUrl: string | null }>();
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  return new Map(rows.map((row) => [row.id, row]));
}

async function buildTaskHistory(taskId: string): Promise<HistoryItem[]> {
  const [task] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      createdBy: tasks.createdBy,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));

  if (!task) {
    return [];
  }

  const logs = await storage.getActivityLogByEntity("task", taskId);
  const commentsList = await db
    .select({
      id: comments.id,
      userId: comments.userId,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(eq(comments.taskId, taskId))
    .orderBy(desc(comments.createdAt));
  const timeEntriesList = await db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      title: timeEntries.title,
      description: timeEntries.description,
      durationSeconds: timeEntries.durationSeconds,
      createdAt: timeEntries.createdAt,
    })
    .from(timeEntries)
    .where(eq(timeEntries.taskId, taskId))
    .orderBy(desc(timeEntries.createdAt));

  const actorIds = new Set<string>();
  if (task.createdBy) actorIds.add(task.createdBy);
  logs.forEach((log) => actorIds.add(log.actorUserId));
  commentsList.forEach((comment) => actorIds.add(comment.userId));
  timeEntriesList.forEach((entry) => actorIds.add(entry.userId));
  const userMap = await getUsersByIds(Array.from(actorIds));

  const items: HistoryItem[] = logs.map((log) => {
    const diff = (log.diffJson || {}) as Record<string, unknown>;
    const user = userMap.get(log.actorUserId);
    return {
      id: log.id,
      type: log.action,
      timestamp: log.createdAt,
      actorId: log.actorUserId,
      actorName: (diff.actorName as string) || getUserLabel(user),
      actorEmail: (diff.actorEmail as string) || user?.email || "",
      actorAvatarUrl: (diff.actorAvatarUrl as string) || user?.avatarUrl || null,
      entityId: log.entityId,
      entityTitle: (diff.entityTitle as string) || (diff.title as string) || task.title,
      metadata: diff,
    };
  });

  const existingTypes = new Set(items.map((item) => item.type));
  const taskCreatedAt = toSafeDate(task.createdAt);
  const taskUpdatedAt = toSafeDate(task.updatedAt);

  if (!existingTypes.has("task_created")) {
    const creator = task.createdBy ? userMap.get(task.createdBy) : undefined;
    items.push({
      id: `task-created-${task.id}`,
      type: "task_created",
      timestamp: taskCreatedAt || task.createdAt,
      actorId: task.createdBy || "system",
      actorName: getUserLabel(creator),
      actorEmail: creator?.email || "",
      actorAvatarUrl: creator?.avatarUrl || null,
      entityId: task.id,
      entityTitle: task.title,
    });
  }

  if (
    !existingTypes.has("task_updated") &&
    taskCreatedAt &&
    taskUpdatedAt &&
    taskUpdatedAt.getTime() - taskCreatedAt.getTime() > 60_000
  ) {
    const creator = task.createdBy ? userMap.get(task.createdBy) : undefined;
    items.push({
      id: `task-updated-${task.id}-${taskUpdatedAt.getTime()}`,
      type: "task_updated",
      timestamp: taskUpdatedAt,
      actorId: task.createdBy || "system",
      actorName: getUserLabel(creator),
      actorEmail: creator?.email || "",
      actorAvatarUrl: creator?.avatarUrl || null,
      entityId: task.id,
      entityTitle: task.title,
    });
  }

  if (!existingTypes.has("comment_added")) {
    commentsList.forEach((comment) => {
      const author = userMap.get(comment.userId);
      items.push({
        id: `comment-${comment.id}`,
        type: "comment_added",
        timestamp: comment.createdAt,
        actorId: comment.userId,
        actorName: getUserLabel(author),
        actorEmail: author?.email || "",
        actorAvatarUrl: author?.avatarUrl || null,
        entityId: task.id,
        entityTitle: task.title,
        metadata: { commentBody: typeof comment.body === "string" ? comment.body.substring(0, 140) : "" },
      });
    });
  }

  if (!existingTypes.has("time_logged")) {
    timeEntriesList.forEach((entry) => {
      const author = userMap.get(entry.userId);
      items.push({
        id: `time-entry-${entry.id}`,
        type: "time_logged",
        timestamp: entry.createdAt,
        actorId: entry.userId,
        actorName: getUserLabel(author),
        actorEmail: author?.email || "",
        actorAvatarUrl: author?.avatarUrl || null,
        entityId: task.id,
        entityTitle: task.title,
        metadata: {
          durationSeconds: entry.durationSeconds,
          description: entry.description,
          title: entry.title,
        },
      });
    });
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function buildSubtaskHistory(subtaskId: string): Promise<HistoryItem[]> {
  const [subtask] = await db
    .select({
      id: subtasks.id,
      title: subtasks.title,
      createdAt: subtasks.createdAt,
      updatedAt: subtasks.updatedAt,
      assigneeId: subtasks.assigneeId,
    })
    .from(subtasks)
    .where(eq(subtasks.id, subtaskId));

  if (!subtask) {
    return [];
  }

  const logs = await storage.getActivityLogByEntity("subtask", subtaskId);
  const commentsList = await db
    .select({
      id: comments.id,
      userId: comments.userId,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(eq(comments.subtaskId, subtaskId))
    .orderBy(desc(comments.createdAt));
  const timeEntriesList = await db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      title: timeEntries.title,
      description: timeEntries.description,
      durationSeconds: timeEntries.durationSeconds,
      createdAt: timeEntries.createdAt,
    })
    .from(timeEntries)
    .where(eq(timeEntries.subtaskId, subtaskId))
    .orderBy(desc(timeEntries.createdAt));

  const actorIds = new Set<string>();
  if (subtask.assigneeId) actorIds.add(subtask.assigneeId);
  logs.forEach((log) => actorIds.add(log.actorUserId));
  commentsList.forEach((comment) => actorIds.add(comment.userId));
  timeEntriesList.forEach((entry) => actorIds.add(entry.userId));
  const userMap = await getUsersByIds(Array.from(actorIds));

  const items: HistoryItem[] = logs.map((log) => {
    const diff = (log.diffJson || {}) as Record<string, unknown>;
    const user = userMap.get(log.actorUserId);
    return {
      id: log.id,
      type: log.action,
      timestamp: log.createdAt,
      actorId: log.actorUserId,
      actorName: (diff.actorName as string) || getUserLabel(user),
      actorEmail: (diff.actorEmail as string) || user?.email || "",
      actorAvatarUrl: (diff.actorAvatarUrl as string) || user?.avatarUrl || null,
      entityId: log.entityId,
      entityTitle: (diff.entityTitle as string) || (diff.title as string) || subtask.title,
      metadata: diff,
    };
  });

  const existingTypes = new Set(items.map((item) => item.type));

  if (!existingTypes.has("comment_added")) {
    commentsList.forEach((comment) => {
      const author = userMap.get(comment.userId);
      items.push({
        id: `subtask-comment-${comment.id}`,
        type: "comment_added",
        timestamp: comment.createdAt,
        actorId: comment.userId,
        actorName: getUserLabel(author),
        actorEmail: author?.email || "",
        actorAvatarUrl: author?.avatarUrl || null,
        entityId: subtask.id,
        entityTitle: subtask.title,
        metadata: { commentBody: typeof comment.body === "string" ? comment.body.substring(0, 140) : "" },
      });
    });
  }

  if (!existingTypes.has("time_logged")) {
    timeEntriesList.forEach((entry) => {
      const author = userMap.get(entry.userId);
      items.push({
        id: `subtask-time-entry-${entry.id}`,
        type: "time_logged",
        timestamp: entry.createdAt,
        actorId: entry.userId,
        actorName: getUserLabel(author),
        actorEmail: author?.email || "",
        actorAvatarUrl: author?.avatarUrl || null,
        entityId: subtask.id,
        entityTitle: subtask.title,
        metadata: {
          durationSeconds: entry.durationSeconds,
          description: entry.description,
          title: entry.title,
        },
      });
    });
  }

  if (items.length === 0) {
    const assignee = subtask.assigneeId ? userMap.get(subtask.assigneeId) : undefined;
    items.push({
      id: `subtask-created-${subtask.id}`,
      type: "created",
      timestamp: subtask.createdAt,
      actorId: subtask.assigneeId || "system",
      actorName: getUserLabel(assignee),
      actorEmail: assignee?.email || "",
      actorAvatarUrl: assignee?.avatarUrl || null,
      entityId: subtask.id,
      entityTitle: subtask.title,
    });
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

router.post("/activity-log", async (req, res) => {
  try {
    const data = insertActivityLogSchema.parse({
      ...req.body,
      userId: getCurrentUserId(req),
    });
    const log = await storage.createActivityLog(data);
    res.status(201).json(log);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/activity-log", req);
  }
});

router.get("/activity-log/:entityType/:entityId/rich", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (entityType === "task") {
      return res.json(await buildTaskHistory(entityId));
    }

    if (entityType === "subtask") {
      return res.json(await buildSubtaskHistory(entityId));
    }

    const logs = await storage.getActivityLogByEntity(entityType, entityId);
    res.json(logs);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/activity-log/:entityType/:entityId/rich", req);
  }
});

router.get("/activity-log/:entityType/:entityId", async (req, res) => {
  try {
    const logs = await storage.getActivityLogByEntity(
      req.params.entityType,
      req.params.entityId,
    );
    res.json(logs);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/activity-log/:entityType/:entityId", req);
  }
});

export default router;
