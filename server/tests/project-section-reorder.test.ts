import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  project: vi.fn(), visible: vi.fn(), transaction: vi.fn(), read: vi.fn(), write: vi.fn(), emit: vi.fn(),
}));
vi.mock("../http/routerFactory", () => ({ createApiRouter: () => express.Router() }));
vi.mock("../storage", () => ({ storage: { getProjectByIdAndTenant: mocks.project } }));
vi.mock("../db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("../lib/privateVisibility", () => ({ canViewProject: mocks.visible }));
vi.mock("../realtime/events", () => ({ emitSectionReordered: mocks.emit }));
import projectsRouter from "../http/domains/projects.router";

function app(role = "employee") {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role } as Express.User;
    req.tenant = { effectiveTenantId: "tenant-1" } as any;
    next();
  });
  server.use(projectsRouter);
  return server;
}
const url = "/projects/project-1/sections/reorder";

describe("Project section reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({ id: "project-1", tenantId: "tenant-1" });
    mocks.visible.mockResolvedValue(true);
    mocks.read.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    mocks.write.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback) => callback({
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ for: mocks.read }) }) }) }),
      update: () => ({ set: (values: unknown) => ({ where: () => mocks.write(values) }) }),
    }));
  });
  it("saves every section position and broadcasts the new order", async () => {
    const response = await request(app()).patch(url).send({ sectionIds: ["b", "c", "a"] });
    expect(response.status).toBe(200);
    expect(mocks.project).toHaveBeenCalledWith("project-1", "tenant-1");
    expect(mocks.write.mock.calls).toEqual([[{ orderIndex: 0 }], [{ orderIndex: 1 }], [{ orderIndex: 2 }]]);
    expect(mocks.emit).toHaveBeenCalledWith("project-1", [{ id: "b", position: 0 }, { id: "c", position: 1 }, { id: "a", position: 2 }]);
  });
  it.each([["a", "a", "c"], ["a", "b"], ["a", "b", "foreign"], []])("rejects invalid or stale section order %j", async (...sectionIds) => {
    const response = await request(app()).patch(url).send({ sectionIds });
    expect(response.status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("rejects projects outside the tenant", async () => {
    mocks.project.mockResolvedValue(undefined);
    expect((await request(app()).patch(url).send({ sectionIds: ["a", "b", "c"] })).status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects inaccessible private projects", async () => {
    mocks.visible.mockResolvedValue(false);
    expect((await request(app()).patch(url).send({ sectionIds: ["a", "b", "c"] })).status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects client users", async () => {
    expect((await request(app("client")).patch(url).send({ sectionIds: ["a", "b", "c"] })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("does not broadcast a failed save", async () => {
    mocks.write.mockRejectedValue(new Error("Write failed"));
    expect((await request(app()).patch(url).send({ sectionIds: ["a", "b", "c"] })).status).toBe(500);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
