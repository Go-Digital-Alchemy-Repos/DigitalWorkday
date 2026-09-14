import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { request } from "./httpHarness";

const mocks = vi.hoisted(() => ({
  getEntry: vi.fn(),
  deleteEntry: vi.fn(),
  emit: vi.fn(),
}));
vi.mock("../http/domains/time/shared", () => ({
  storage: { getTimeEntryByIdAndTenant: mocks.getEntry, deleteTimeEntryWithTenant: mocks.deleteEntry },
  getEffectiveTenantId: () => "tenant-1",
  getCurrentUserId: () => "user-1",
  getCurrentWorkspaceId: () => "workspace-1",
  isStrictMode: () => true,
  isSoftMode: () => false,
  emitTimeEntryDeleted: mocks.emit,
  AppError: {
    notFound: () => ({ status: 404 }),
    forbidden: () => ({ status: 403 }),
  },
  handleRouteError: (res: express.Response, error: { status: number }) => res.status(error.status || 500).json({ error: "Denied" }),
}));
import entriesRouter from "../http/domains/time/entries.routes";

function app(role = "employee") {
  const server = express();
  server.use((req, _res, next) => {
    req.user = { id: "user-1", role } as Express.User;
    next();
  });
  server.use(entriesRouter);
  return server;
}

describe("Time entry deletion permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEntry.mockResolvedValue({ id: "entry-1", tenantId: "tenant-1", userId: "user-1" });
  });
  it("allows the entry creator to delete", async () => {
    expect((await request(app()).delete("/time-entries/entry-1")).status).toBe(204);
    expect(mocks.deleteEntry).toHaveBeenCalledWith("entry-1", "tenant-1");
  });
  it("denies another employee without deleting or emitting", async () => {
    mocks.getEntry.mockResolvedValue({ id: "entry-1", tenantId: "tenant-1", userId: "user-2" });
    expect((await request(app()).delete("/time-entries/entry-1")).status).toBe(403);
    expect(mocks.deleteEntry).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("allows an administrator to delete another user's entry", async () => {
    mocks.getEntry.mockResolvedValue({ id: "entry-1", tenantId: "tenant-1", userId: "user-2" });
    expect((await request(app("admin")).delete("/time-entries/entry-1")).status).toBe(204);
    expect(mocks.deleteEntry).toHaveBeenCalled();
  });
  it("does not delete entries outside the tenant", async () => {
    mocks.getEntry.mockResolvedValue(undefined);
    expect((await request(app()).delete("/time-entries/entry-1")).status).toBe(404);
    expect(mocks.deleteEntry).not.toHaveBeenCalled();
  });
});
