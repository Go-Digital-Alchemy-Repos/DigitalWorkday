import { describe, expect, it, vi } from "vitest";
import { buildTimerStartContext, findExistingTimerForStart } from "../lib/timerStart";

describe("timer start helpers", () => {
  it("finds a legacy null-tenant timer even in tenant-scoped starts", async () => {
    const storage = {
      getActiveTimerByUserAndTenant: vi.fn().mockResolvedValue(undefined),
      getActiveTimerByUser: vi.fn().mockResolvedValue({
        id: "timer-legacy",
        tenantId: null,
      }),
    };

    const existing = await findExistingTimerForStart(storage, "user-1", "tenant-1");

    expect(existing).toEqual({ id: "timer-legacy", tenantId: null });
    expect(storage.getActiveTimerByUserAndTenant).toHaveBeenCalledWith("user-1", "tenant-1");
    expect(storage.getActiveTimerByUser).toHaveBeenCalledWith("user-1");
  });

  it("derives project, client, and workspace from the task when the request omits them", async () => {
    const storage = {
      getTask: vi.fn().mockResolvedValue({ id: "task-1", projectId: "project-1" }),
      getProject: vi.fn().mockResolvedValue({
        id: "project-1",
        workspaceId: "workspace-1",
        clientId: "client-1",
      }),
    };

    const context = await buildTimerStartContext(
      storage,
      { projectId: null, clientId: null },
      { taskId: "task-1", subtaskId: null },
      async () => {
        throw new Error("workspace cache cold");
      },
    );

    expect(context).toEqual({
      workspaceId: "workspace-1",
      projectId: "project-1",
      clientId: "client-1",
      taskId: "task-1",
      subtaskId: null,
    });
  });
});
