import type {
  ActiveTimerWithRelations,
  Client,
  Comment,
  Project,
  TaskWithRelations,
  TimeEntryWithRelations,
  User,
} from "@shared/schema";
import type {
  DesktopTask,
  DesktopTaskPage,
  DesktopTimeEntry,
  DesktopUser,
} from "@shared/desktopContracts";

type DesktopUserSource = Pick<User, "id" | "name" | "firstName" | "lastName" | "email" | "role" | "avatarUrl">;

export function toDesktopUser(user: DesktopUserSource): DesktopUser {
  return {
    id: user.id,
    name: user.name ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
  };
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function toDesktopTask(
  task: TaskWithRelations,
  clientsById: ReadonlyMap<string, Client> = new Map(),
): DesktopTask {
  const project = task.project;
  const client = project?.clientId ? clientsById.get(project.clientId) : undefined;
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: iso(task.dueDate),
    isPersonal: task.isPersonal === true || !task.projectId,
    projectId: task.projectId ?? null,
    projectName: project?.name ?? null,
    clientId: project?.clientId ?? null,
    clientName: client?.companyName ?? null,
    sectionId: task.sectionId ?? null,
    assigneeIds: (task.assignees ?? []).map((value: any) => value.userId || value.user?.id).filter(Boolean),
    assignees: (task.assignees ?? []).map((value: any) => value.user).filter(Boolean).map((user: User) => ({
      id: user.id,
      name: user.name ?? null,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
    })),
    estimateMinutes: task.estimateMinutes ?? null,
    subtasks: (task.subtasks ?? []).map((subtask) => ({
      id: subtask.id,
      taskId: subtask.taskId,
      title: subtask.title,
      status: subtask.status,
      completed: subtask.completed,
      dueDate: iso(subtask.dueDate),
      updatedAt: iso(subtask.updatedAt)!,
    })),
    createdAt: iso(task.createdAt)!,
    updatedAt: iso(task.updatedAt)!,
  };
}

export function toDesktopTaskPage(
  tasks: TaskWithRelations[],
  clientsById: ReadonlyMap<string, Client>,
  offset: number,
  limit: number,
): DesktopTaskPage {
  const items = tasks.slice(offset, offset + limit).map((task) => toDesktopTask(task, clientsById));
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: nextOffset < tasks.length
      ? Buffer.from(String(nextOffset), "utf8").toString("base64url")
      : null,
  };
}

export function toDesktopTimeEntry(entry: TimeEntryWithRelations): DesktopTimeEntry {
  return {
    id: entry.id,
    taskId: entry.taskId ?? null,
    projectId: entry.projectId ?? null,
    title: entry.title ?? null,
    description: entry.description ?? null,
    startTime: iso(entry.startTime)!,
    endTime: iso(entry.endTime),
    durationSeconds: Math.max(0, entry.durationSeconds ?? 0),
    isManual: entry.isManual,
    projectName: entry.project?.name ?? null,
    taskTitle: entry.task?.title ?? null,
    updatedAt: iso(entry.updatedAt)!,
  };
}

export function toDesktopProject(project: Project, client?: Client) {
  return {
    id: project.id,
    name: project.name,
    clientId: project.clientId ?? null,
    clientName: client?.companyName ?? null,
  };
}

export function toDesktopTimer(timer: ActiveTimerWithRelations | undefined) {
  if (!timer) return null;
  return {
    id: timer.id,
    taskId: timer.taskId ?? null,
    projectId: timer.projectId ?? null,
    clientId: timer.clientId ?? null,
    title: timer.title ?? null,
    description: timer.description ?? null,
    status: timer.status as "running" | "paused",
    elapsedSeconds: timer.elapsedSeconds,
    lastStartedAt: iso(timer.lastStartedAt),
    createdAt: iso(timer.createdAt)!,
    updatedAt: iso(timer.updatedAt)!,
  };
}

export function toDesktopComment(comment: Comment & { user?: User }) {
  return {
    id: comment.id,
    taskId: comment.taskId ?? null,
    body: comment.body,
    visibility: comment.visibility ?? "internal",
    createdAt: iso(comment.createdAt)!,
    updatedAt: iso(comment.updatedAt)!,
    user: comment.user ? {
      id: comment.user.id,
      name: comment.user.name ?? null,
      firstName: comment.user.firstName ?? null,
      lastName: comment.user.lastName ?? null,
      email: comment.user.email,
      avatarUrl: comment.user.avatarUrl ?? null,
    } : null,
  };
}
