import type { InsertActivityLog, Task, Subtask } from "@shared/schema";

type ActivityStorage = {
  createActivityLog: (log: InsertActivityLog) => Promise<unknown>;
  getUser: (userId: string) => Promise<{
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | undefined>;
};

type ActivityActor = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type LogEntityActivityInput = {
  storage: ActivityStorage;
  workspaceId: string;
  actorUserId: string;
  entityType: "task" | "subtask" | "project";
  entityId: string;
  entityTitle: string;
  action: string;
  metadata?: Record<string, unknown>;
};

type TaskLike = Pick<Task, "id" | "title" | "projectId" | "status" | "priority" | "dueDate" | "estimateMinutes" | "description">;
type SubtaskLike = Pick<Subtask, "id" | "taskId" | "title" | "status" | "priority" | "dueDate" | "estimateMinutes" | "description">;

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : value ? JSON.stringify(value) : "";
}

async function getActor(storage: ActivityStorage, userId: string): Promise<ActivityActor> {
  const user = await storage.getUser(userId);
  return {
    id: userId,
    name: user?.name || user?.email || "Someone",
    email: user?.email || "",
    avatarUrl: user?.avatarUrl || null,
  };
}

export async function logEntityActivity({
  storage,
  workspaceId,
  actorUserId,
  entityType,
  entityId,
  entityTitle,
  action,
  metadata = {},
}: LogEntityActivityInput): Promise<void> {
  const actor = await getActor(storage, actorUserId);
  await storage.createActivityLog({
    workspaceId,
    actorUserId,
    entityType,
    entityId,
    action,
    diffJson: {
      actorName: actor.name,
      actorEmail: actor.email,
      actorAvatarUrl: actor.avatarUrl,
      entityTitle,
      ...metadata,
    },
  });
}

export async function logTaskCreated(
  storage: ActivityStorage,
  actorUserId: string,
  workspaceId: string,
  task: Pick<Task, "id" | "title" | "projectId">
): Promise<void> {
  await logEntityActivity({
    storage,
    workspaceId,
    actorUserId,
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    action: "created",
    metadata: {
      projectId: task.projectId,
    },
  });
}

export async function logSubtaskCreated(
  storage: ActivityStorage,
  actorUserId: string,
  workspaceId: string,
  subtask: Pick<Subtask, "id" | "taskId" | "title">
): Promise<void> {
  await logEntityActivity({
    storage,
    workspaceId,
    actorUserId,
    entityType: "subtask",
    entityId: subtask.id,
    entityTitle: subtask.title,
    action: "created",
    metadata: {
      taskId: subtask.taskId,
    },
  });
}

export async function logTaskFieldChanges(
  storage: ActivityStorage,
  actorUserId: string,
  workspaceId: string,
  before: TaskLike,
  after: TaskLike
): Promise<void> {
  const updates: Array<Promise<void>> = [];
  const projectId = after.projectId || before.projectId || null;

  if (before.status !== after.status) {
    updates.push(
      logEntityActivity({
        storage,
        workspaceId,
        actorUserId,
        entityType: "task",
        entityId: after.id,
        entityTitle: after.title,
        action: "status_changed",
        metadata: { from: before.status, to: after.status, projectId },
      }),
    );
  }

  const fieldDiffs: Array<[string, unknown, unknown]> = [
    ["title", before.title, after.title],
    ["description", normalizeText(before.description), normalizeText(after.description)],
    ["priority", before.priority, after.priority],
    ["dueDate", normalizeDate(before.dueDate), normalizeDate(after.dueDate)],
    ["estimateMinutes", before.estimateMinutes ?? null, after.estimateMinutes ?? null],
  ];

  for (const [field, from, to] of fieldDiffs) {
    if (from !== to) {
      updates.push(
        logEntityActivity({
          storage,
          workspaceId,
          actorUserId,
          entityType: "task",
          entityId: after.id,
          entityTitle: after.title,
          action: "updated",
          metadata: { field, from, to, projectId },
        }),
      );
    }
  }

  await Promise.all(updates);
}

export async function logSubtaskFieldChanges(
  storage: ActivityStorage,
  actorUserId: string,
  workspaceId: string,
  before: SubtaskLike,
  after: SubtaskLike,
  projectId: string | null
): Promise<void> {
  const updates: Array<Promise<void>> = [];

  if (before.status !== after.status) {
    updates.push(
      logEntityActivity({
        storage,
        workspaceId,
        actorUserId,
        entityType: "subtask",
        entityId: after.id,
        entityTitle: after.title,
        action: "status_changed",
        metadata: { from: before.status, to: after.status, taskId: after.taskId, projectId },
      }),
    );
  }

  const fieldDiffs: Array<[string, unknown, unknown]> = [
    ["title", before.title, after.title],
    ["description", normalizeText(before.description), normalizeText(after.description)],
    ["priority", before.priority, after.priority],
    ["dueDate", normalizeDate(before.dueDate), normalizeDate(after.dueDate)],
    ["estimateMinutes", before.estimateMinutes ?? null, after.estimateMinutes ?? null],
  ];

  for (const [field, from, to] of fieldDiffs) {
    if (from !== to) {
      updates.push(
        logEntityActivity({
          storage,
          workspaceId,
          actorUserId,
          entityType: "subtask",
          entityId: after.id,
          entityTitle: after.title,
          action: "updated",
          metadata: { field, from, to, taskId: after.taskId, projectId },
        }),
      );
    }
  }

  await Promise.all(updates);
}
