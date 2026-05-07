import { describe, expect, it } from "vitest";

import {
  buildStopTimerPayload,
  buildSubtaskQuickStartTimerPayload,
  buildTaskQuickStartTimerPayload,
} from "@/features/tasks/timer-payloads";

describe("timer payload builders", () => {
  it("builds a task quick-start payload with null-safe defaults", () => {
    expect(
      buildTaskQuickStartTimerPayload({
        clientId: "client_1",
        projectId: "project_1",
        taskId: "task_1",
        title: "Review homepage",
      }),
    ).toEqual({
      clientId: "client_1",
      projectId: "project_1",
      taskId: "task_1",
      title: "Review homepage",
      description: null,
    });
  });

  it("builds a subtask quick-start payload with optional subtask id", () => {
    expect(
      buildSubtaskQuickStartTimerPayload({
        clientId: "client_1",
        projectId: "project_1",
        taskId: "task_1",
        subtaskId: "subtask_1",
        title: "Review hero copy",
      }),
    ).toEqual({
      clientId: "client_1",
      projectId: "project_1",
      taskId: "task_1",
      subtaskId: "subtask_1",
      title: "Review hero copy",
      description: null,
    });
  });

  it("omits empty titles and normalizes missing ids to null", () => {
    expect(
      buildSubtaskQuickStartTimerPayload({
        title: "",
      }),
    ).toEqual({
      clientId: null,
      projectId: null,
      taskId: null,
      subtaskId: null,
      title: undefined,
      description: null,
    });
  });

  it("builds a stop payload with the description preserved", () => {
    expect(
      buildStopTimerPayload({
        title: "Review homepage",
        description: "Wrapped up QA pass",
        clientId: "client_1",
        projectId: "project_1",
        taskId: "task_1",
        subtaskId: "subtask_1",
      }),
    ).toEqual({
      scope: "in_scope",
      title: "Review homepage",
      description: "Wrapped up QA pass",
      clientId: "client_1",
      projectId: "project_1",
      taskId: "task_1",
      subtaskId: "subtask_1",
    });
  });
});
