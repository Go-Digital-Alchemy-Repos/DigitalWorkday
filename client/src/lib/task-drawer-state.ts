import type { TaskWithRelations } from "@shared/schema";

export type TaskDrawerRenderState = "closed" | "loading" | "error" | "ready";

export function getTaskDrawerRenderState(params: {
  taskIdToOpen: string | null;
  task: TaskWithRelations | undefined;
  isLoading: boolean;
  isError: boolean;
}): TaskDrawerRenderState {
  const { taskIdToOpen, task, isLoading, isError } = params;

  if (!taskIdToOpen) return "closed";
  if (task) return "ready";
  if (isLoading) return "loading";
  if (isError) return "error";
  return "loading";
}
