import { describe, expect, it } from "vitest";

import { getTaskDrawerRenderState } from "@/lib/task-drawer-state";

describe("getTaskDrawerRenderState", () => {
  it("returns closed when no task is selected", () => {
    expect(
      getTaskDrawerRenderState({
        taskIdToOpen: null,
        task: undefined,
        isLoading: false,
        isError: false,
      }),
    ).toBe("closed");
  });

  it("returns ready as soon as task data exists", () => {
    expect(
      getTaskDrawerRenderState({
        taskIdToOpen: "task_1",
        task: { id: "task_1" } as any,
        isLoading: true,
        isError: false,
      }),
    ).toBe("ready");
  });

  it("returns loading while waiting for task data", () => {
    expect(
      getTaskDrawerRenderState({
        taskIdToOpen: "task_1",
        task: undefined,
        isLoading: true,
        isError: false,
      }),
    ).toBe("loading");
  });

  it("returns error when loading fails and no task data exists", () => {
    expect(
      getTaskDrawerRenderState({
        taskIdToOpen: "task_1",
        task: undefined,
        isLoading: false,
        isError: true,
      }),
    ).toBe("error");
  });

  it("defaults to loading for unresolved in-between states", () => {
    expect(
      getTaskDrawerRenderState({
        taskIdToOpen: "task_1",
        task: undefined,
        isLoading: false,
        isError: false,
      }),
    ).toBe("loading");
  });
});
