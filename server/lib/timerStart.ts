import { AppError } from "./errors";

type TimerWithTenant = {
  tenantId: string | null;
};

type TaskLike = {
  id: string;
  projectId: string | null;
};

type ProjectLike = {
  id: string;
  workspaceId: string;
  clientId: string | null;
};

export type TimerStartAssignment = {
  taskId: string | null;
  subtaskId: string | null;
};

export type TimerStartContext = {
  workspaceId: string;
  projectId: string | null;
  clientId: string | null;
  taskId: string | null;
  subtaskId: string | null;
};

export interface TimerStartStorage {
  getActiveTimerByUserAndTenant(userId: string, tenantId: string): Promise<TimerWithTenant | undefined>;
  getActiveTimerByUser(userId: string): Promise<TimerWithTenant | undefined>;
  getTask(id: string): Promise<TaskLike | undefined>;
  getProject(id: string): Promise<ProjectLike | undefined>;
}

export async function findExistingTimerForStart(
  storage: TimerStartStorage,
  userId: string,
  tenantId: string | null,
) {
  if (tenantId) {
    const tenantTimer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    if (tenantTimer) {
      return tenantTimer;
    }
  }

  return storage.getActiveTimerByUser(userId);
}

export async function buildTimerStartContext(
  storage: Pick<TimerStartStorage, "getTask" | "getProject">,
  body: {
    projectId?: string | null;
    clientId?: string | null;
  },
  assignment: TimerStartAssignment,
  getWorkspaceId: () => Promise<string>,
): Promise<TimerStartContext> {
  const task = assignment.taskId ? await storage.getTask(assignment.taskId) : undefined;
  let projectId = body.projectId || task?.projectId || null;
  let clientId = body.clientId || null;

  if (assignment.taskId && !task) {
    throw AppError.badRequest("Task not found");
  }

  let project = projectId ? await storage.getProject(projectId) : undefined;
  if (projectId && !project) {
    throw AppError.badRequest("Project not found");
  }

  if (task?.projectId) {
    if (!projectId) {
      projectId = task.projectId;
      project = await storage.getProject(projectId);
    } else if (task.projectId !== projectId) {
      throw AppError.badRequest("Task does not belong to the selected project");
    }
  }

  if (project?.clientId) {
    if (!clientId) {
      clientId = project.clientId;
    } else if (project.clientId !== clientId) {
      throw AppError.badRequest("Project does not belong to the selected client");
    }
  }

  const workspaceId = await getWorkspaceId().catch(() => project?.workspaceId || null);
  if (!workspaceId) {
    throw AppError.badRequest("Workspace context required to start timer");
  }

  return {
    workspaceId,
    projectId,
    clientId,
    taskId: assignment.taskId,
    subtaskId: assignment.subtaskId,
  };
}
