import { AppError } from "./errors";

interface AssignmentStorage {
  getTask(id: string): Promise<{ id: string; projectId: string | null } | undefined>;
  getSubtask(id: string): Promise<{ id: string; taskId: string } | undefined>;
}

export async function normalizeTimeTrackingAssignment(
  storage: AssignmentStorage,
  projectId: string | null,
  taskId: string | null,
  subtaskId: string | null,
) {
  let normalizedTaskId = taskId;

  let task = normalizedTaskId ? await storage.getTask(normalizedTaskId) : undefined;
  if (normalizedTaskId && !task) {
    throw AppError.badRequest("Task not found");
  }

  if (subtaskId) {
    const subtask = await storage.getSubtask(subtaskId);
    if (!subtask) {
      throw AppError.badRequest("Subtask not found");
    }
    if (!normalizedTaskId) {
      normalizedTaskId = subtask.taskId;
      task = await storage.getTask(normalizedTaskId);
    }
    if (subtask.taskId !== normalizedTaskId) {
      throw AppError.badRequest("Subtask does not belong to the selected task");
    }
  }

  if (projectId && normalizedTaskId) {
    task = task || await storage.getTask(normalizedTaskId);
    if (!task) {
      throw AppError.badRequest("Task not found");
    }
    if (task.projectId !== projectId) {
      throw AppError.badRequest("Task does not belong to the selected project");
    }
  }

  return {
    taskId: normalizedTaskId,
    subtaskId,
  };
}
