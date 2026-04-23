export const CANONICAL_TASK_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
] as const;

export type CanonicalTaskStatus = (typeof CANONICAL_TASK_STATUSES)[number];

export function normalizeTaskStatus(status: string | null | undefined): CanonicalTaskStatus | undefined {
  if (!status) return undefined;

  switch (status) {
    case "review":
      return "in_review";
    case "completed":
      return "done";
    case "todo":
    case "in_progress":
    case "in_review":
    case "blocked":
    case "done":
      return status;
    default:
      return undefined;
  }
}

export function isTaskDoneStatus(status: string | null | undefined): boolean {
  return normalizeTaskStatus(status) === "done";
}

export function isTaskReviewStatus(status: string | null | undefined): boolean {
  return normalizeTaskStatus(status) === "in_review";
}

export function getTaskStatusLabel(status: string | null | undefined): string {
  switch (normalizeTaskStatus(status)) {
    case "todo":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "in_review":
      return "In Review";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    default:
      return status || "Unknown";
  }
}
