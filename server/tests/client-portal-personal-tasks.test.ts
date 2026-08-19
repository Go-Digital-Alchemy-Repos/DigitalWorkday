import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@shared/schema";

const mocks = vi.hoisted(() => ({
  createTaskWithTenant: vi.fn(),
  createSubtask: vi.fn(),
  getClient: vi.fn(),
  getTask: vi.fn(),
  requireActivePortalAccess: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    createTaskWithTenant: mocks.createTaskWithTenant,
    createSubtask: mocks.createSubtask,
    getClient: mocks.getClient,
    getTask: mocks.getTask,
  },
}));

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
}));

vi.mock("../services/portalAuthorization", () => ({
  requireActivePortalAccess: mocks.requireActivePortalAccess,
  normalizePortalAccessLevel: (level: string) => level,
  getPortalCapabilities: vi.fn(),
  countActiveClientAdmins: vi.fn(),
}));

import workspaceRouter from "../features/client-portal/workspace.router";

function appFor(role: "collaborator" | "client_admin") {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: "11111111-1111-4111-8111-111111111111", role: UserRole.CLIENT, name: role };
    next();
  });
  app.use("/api/client-portal", workspaceRouter);
  return app;
}

describe("client portal personal task creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActivePortalAccess.mockResolvedValue({ accessLevel: "collaborator", status: "active" });
    mocks.getClient.mockResolvedValue({ id: "client-a", tenantId: "tenant-a", workspaceId: "workspace-a" });
    mocks.createTaskWithTenant.mockResolvedValue({ id: "task-a", title: "Private follow-up", isPersonal: true });
    mocks.createSubtask.mockResolvedValue({ id: "subtask-a" });
  });

  it.each(["collaborator", "client_admin"] as const)("allows an active %s to create a Client-scoped personal task", async (role) => {
    mocks.requireActivePortalAccess.mockResolvedValue({ accessLevel: role, status: "active" });
    const response = await request(appFor(role)).post("/api/client-portal/clients/client-a/tasks/personal").send({
      title: "Private follow-up",
      priority: "high",
      subtaskTitles: ["Draft response"],
    });

    expect(response.status).toBe(201);
    expect(mocks.requireActivePortalAccess).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "client-a");
    expect(mocks.createTaskWithTenant).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "client-a",
      tenantId: "tenant-a",
      projectId: null,
      sectionId: null,
      createdBy: "11111111-1111-4111-8111-111111111111",
      isPersonal: true,
      visibility: "private",
    }), "tenant-a");
    expect(mocks.createSubtask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-a", title: "Draft response" }));
  });

  it("rejects project assignment fields from the personal-task DTO", async () => {
    const response = await request(appFor("collaborator")).post("/api/client-portal/clients/client-a/tasks/personal").send({
      title: "Attempted bypass",
      assigneeIds: ["22222222-2222-4222-8222-222222222222"],
    });

    expect(response.status).toBe(400);
    expect(mocks.createTaskWithTenant).not.toHaveBeenCalled();
  });
});
