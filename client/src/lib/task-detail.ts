import type { TaskWithRelations } from "@shared/schema";

export async function fetchTaskDetail(taskId: string): Promise<TaskWithRelations> {
  const response = await fetch(`/api/tasks/${taskId}`, { credentials: "include" });

  if (!response.ok) {
    throw new Error("Failed to load task details");
  }

  return response.json();
}
