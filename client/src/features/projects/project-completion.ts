type CompletionTask = {
  id: string;
  status?: string | null;
  archivedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  subtasks?: Array<{
    status?: string | null;
    completed?: boolean | null;
    archivedAt?: string | Date | null;
    deletedAt?: string | Date | null;
  }> | null;
};

const COMPLETE_STATUSES = new Set(["done", "complete", "completed", "cancelled", "canceled"]);

export function isCompleteTaskStatus(status?: string | null): boolean {
  return COMPLETE_STATUSES.has(String(status || "").toLowerCase());
}

function isActiveWorkItem(item: { archivedAt?: unknown; deletedAt?: unknown }): boolean {
  return !item.archivedAt && !item.deletedAt;
}

export function isTaskEffectivelyComplete(task: CompletionTask, statusOverride?: string): boolean {
  const status = statusOverride ?? task.status;
  if (isCompleteTaskStatus(status)) return true;

  const activeSubtasks = (task.subtasks || []).filter(isActiveWorkItem);
  if (activeSubtasks.length === 0) return false;

  return activeSubtasks.every((subtask) => {
    if (subtask.completed === true) return true;
    return isCompleteTaskStatus(subtask.status);
  });
}

export function isProjectCompleteAfterTaskCompletion(
  tasks: CompletionTask[],
  completedTaskId: string,
): boolean {
  const activeTasks = tasks.filter(isActiveWorkItem);
  if (activeTasks.length === 0) return false;

  return activeTasks.every((task) =>
    task.id === completedTaskId ? true : isTaskEffectivelyComplete(task),
  );
}
