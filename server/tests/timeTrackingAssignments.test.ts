import { describe, expect, it, vi } from "vitest";
import { normalizeTimeTrackingAssignment } from "../lib/timeTrackingAssignments";

function buildStorage() {
  return {
    getTask: vi.fn(),
    getSubtask: vi.fn(),
  };
}

describe("normalizeTimeTrackingAssignment", () => {
  it("preserves a valid task/subtask pair", async () => {
    const storage = buildStorage();
    storage.getTask.mockResolvedValue({ id: "task-1", projectId: "project-1" });
    storage.getSubtask.mockResolvedValue({ id: "subtask-1", taskId: "task-1" });

    await expect(
      normalizeTimeTrackingAssignment(storage, "project-1", "task-1", "subtask-1"),
    ).resolves.toEqual({
      taskId: "task-1",
      subtaskId: "subtask-1",
    });
  });

  it("derives the parent task from the subtask when only subtaskId is provided", async () => {
    const storage = buildStorage();
    storage.getTask.mockResolvedValue({ id: "task-1", projectId: "project-1" });
    storage.getSubtask.mockResolvedValue({ id: "subtask-1", taskId: "task-1" });

    await expect(
      normalizeTimeTrackingAssignment(storage, "project-1", null, "subtask-1"),
    ).resolves.toEqual({
      taskId: "task-1",
      subtaskId: "subtask-1",
    });
  });

  it("rejects a subtask that does not belong to the selected task", async () => {
    const storage = buildStorage();
    storage.getTask.mockResolvedValue({ id: "task-1", projectId: "project-1" });
    storage.getSubtask.mockResolvedValue({ id: "subtask-1", taskId: "task-2" });

    await expect(
      normalizeTimeTrackingAssignment(storage, "project-1", "task-1", "subtask-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Subtask does not belong to the selected task",
    });
  });

  it("rejects a task that does not belong to the selected project", async () => {
    const storage = buildStorage();
    storage.getTask.mockResolvedValue({ id: "task-1", projectId: "project-2" });

    await expect(
      normalizeTimeTrackingAssignment(storage, "project-1", "task-1", null),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Task does not belong to the selected project",
    });
  });
});
