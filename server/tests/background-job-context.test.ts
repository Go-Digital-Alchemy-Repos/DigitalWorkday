import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), writes: [] as any[] }));
vi.mock("../db", () => ({ db: {
  execute: mocks.execute,
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ status: "running" }] }) }) }),
  update: () => ({ set: (values: any) => ({ where: async () => { mocks.writes.push(values); } }) }),
} }));
const { registerHandler, startJobQueue, stopJobQueue } = await import("../jobs/queue");
beforeEach(() => { mocks.writes = []; mocks.execute.mockReset(); });
afterEach(() => { stopJobQueue(); });

describe("background queue raw SQL rows", () => {
  it("provides tenant and actor context and honors retry limits from snake case columns", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("retry me"));
    registerHandler("context_test", handler);
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "job-1", type: "context_test", tenant_id: "tenant-1", created_by_user_id: "ben", max_attempts: 3, attempts: 1, payload: { taskId: "task-1" } }] })
      .mockResolvedValue({ rows: [] });
    startJobQueue();
    await vi.waitFor(() => expect(mocks.writes).toHaveLength(1));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", userId: "ben", jobId: "job-1" }));
    expect(mocks.writes[0]).toMatchObject({ status: "pending", error: "retry me" });
  });
});
