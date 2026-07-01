import { describe, expect, it } from "vitest";
import {
  isProjectCompleteAfterTaskCompletion,
  isTaskEffectivelyComplete,
} from "./project-completion";

describe("project completion helpers", () => {
  it("detects when completing the final active task finishes a project", () => {
    expect(
      isProjectCompleteAfterTaskCompletion(
        [
          { id: "task-1", status: "done" },
          { id: "task-2", status: "todo" },
        ],
        "task-2",
      ),
    ).toBe(true);
  });

  it("does not treat a project as complete when other active tasks remain open", () => {
    expect(
      isProjectCompleteAfterTaskCompletion(
        [
          { id: "task-1", status: "todo" },
          { id: "task-2", status: "todo" },
        ],
        "task-2",
      ),
    ).toBe(false);
  });

  it("ignores archived tasks when checking active project completion", () => {
    expect(
      isProjectCompleteAfterTaskCompletion(
        [
          { id: "task-1", status: "todo", archivedAt: "2026-06-29T12:00:00.000Z" },
          { id: "task-2", status: "todo" },
        ],
        "task-2",
      ),
    ).toBe(true);
  });

  it("treats a parent task as complete when all active subtasks are complete", () => {
    expect(
      isTaskEffectivelyComplete({
        id: "task-1",
        status: "todo",
        subtasks: [
          { completed: true },
          { status: "done" },
          { status: "todo", archivedAt: "2026-06-29T12:00:00.000Z" },
        ],
      }),
    ).toBe(true);
  });
});
