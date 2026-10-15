import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const mocks = vi.hoisted(() => ({
  assign: vi.fn(), assignSubtask: vi.fn(), notify: vi.fn(), notifyStatus: vi.fn(),
  getTask: vi.fn(), getUser: vi.fn(), getProject: vi.fn(), updateProject: vi.fn(),
  createSubtask: vi.fn(), getSubtask: vi.fn(), updateSubtask: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), getTaskAssignees: vi.fn(), remove: vi.fn(),
}));
vi.mock("../http/routerFactory", () => ({ createApiRouter: () => express.Router() }));
vi.mock("../services/assignmentEmails", () => ({ assignTaskWithEmail: mocks.assign, assignSubtaskWithEmail: mocks.assignSubtask }));
vi.mock("../features/notifications/notification.service", () => ({ notifyTaskAssigned: mocks.notify, notifyTaskStatusChanged: mocks.notifyStatus }));
vi.mock("../storage", () => ({ storage: {
  getTaskByIdAndTenant: mocks.getTask, getTaskWithRelations: mocks.getTask, getTask: mocks.getTask,
  getUser: mocks.getUser, getProjectByIdAndTenant: mocks.getProject, getProject: mocks.getProject,
  updateProjectWithTenant: mocks.updateProject, getProjectMembers: async () => [],
  getClientByIdAndTenant: async () => ({ id: "client-1" }),
  createSubtask: mocks.createSubtask, getSubtask: mocks.getSubtask, updateSubtask: mocks.updateSubtask,
  createTaskWithTenant: mocks.createTask, updateTaskWithTenant: mocks.updateTask,
  getTaskAssignees: mocks.getTaskAssignees, removeTaskAssignee: mocks.remove,
  getUsersByTenant: async () => [{ id: "daniel", isActive: true }, { id: "existing", isActive: true }],
} }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../realtime/events", () => ({ emitTaskCreated: vi.fn(), emitTaskUpdated: vi.fn(), emitProjectUpdated: vi.fn(), emitSubtaskCreated: vi.fn(), emitSubtaskUpdated: vi.fn() }));
const { default: tasksRouter } = await import("../http/domains/tasks.router");
const { default: subtasksRouter } = await import("../http/domains/subtasks.router");
const { default: projectsRouter } = await import("../http/domains/projects.router");
function app(role = "employee") {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.user = { id: "ben", tenantId: "tenant-1", role } as Express.User;
    req.tenant = { effectiveTenantId: "tenant-1" } as any;
    next();
  });
  server.use(tasksRouter, subtasksRouter, projectsRouter);
  return server;
}
const task = { id: "task-1", tenantId: "tenant-1", projectId: "project-1", title: "Load More", isPersonal: false, visibility: "workspace", status: "todo", assignees: [] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.assign.mockResolvedValue({ assignment: { id: "assignment-1" }, created: true });
  mocks.assignSubtask.mockResolvedValue({ assignment: { id: "assignment-1" }, created: true });
  mocks.notify.mockResolvedValue(undefined); mocks.notifyStatus.mockResolvedValue(undefined);
  const subtask = { id: "sub-1", taskId: "task-1", title: "Subtask", status: "todo", assigneeId: null };
  mocks.getSubtask.mockResolvedValue(subtask); mocks.updateSubtask.mockResolvedValue({ ...subtask }); mocks.createSubtask.mockResolvedValue(subtask);
  mocks.getTask.mockResolvedValue(task); mocks.createTask.mockResolvedValue(task); mocks.updateTask.mockResolvedValue(task);
  mocks.getProject.mockResolvedValue({ id: "project-1", tenantId: "tenant-1", name: "Directory", assignmentEmailsEnabled: false });
  mocks.getUser.mockImplementation(async (id) => ({ id, tenantId: "tenant-1", name: "Ben", role: "employee" }));
  mocks.updateProject.mockResolvedValue({ id: "project-1", assignmentEmailsEnabled: true });
  mocks.getTaskAssignees.mockResolvedValue([{ userId: "existing" }]);
});

describe("interactive assignment routes", () => {
  it("keeps the existing in-app assignment notification and uses the shared assignment writer", async () => {
    const response = await request(app()).post("/tasks/task-1/assignees").send({ userId: "daniel" });
    expect(response.status).toBe(201);
    expect(mocks.assign).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1", userId: "daniel", actorUserId: "ben", tenantId: "tenant-1" }), expect.anything());
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith("daniel", "task-1", "Load More", "Ben", "Directory", { tenantId: "tenant-1", excludeUserId: "ben" });
  });
  it("does not repeat in-app notifications for duplicate assignment requests", async () => {
    mocks.assign.mockResolvedValue({ assignment: { id: "assignment-1" }, created: false });
    expect((await request(app()).post("/tasks/task-1/assignees").send({ userId: "daniel" })).status).toBe(201);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("does not introduce in-app notifications for subtask assignments", async () => {
    expect((await request(app()).post("/subtasks/sub-1/assignees").send({ userId: "daniel" })).status).toBe(201);
    expect(mocks.assignSubtask).toHaveBeenCalledWith(expect.objectContaining({ subtaskId: "sub-1", actorUserId: "ben" }), expect.anything());
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("handles the legacy primary-assignee update without letting storage pre-insert the assignment", async () => {
    expect((await request(app()).patch("/subtasks/sub-1").send({ assigneeId: "daniel" })).status).toBe(200);
    expect(mocks.updateSubtask).toHaveBeenCalledWith("sub-1", {});
    expect(mocks.assignSubtask).toHaveBeenCalledWith(expect.objectContaining({ userId: "daniel", setPrimaryAssignee: true }), expect.anything());
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("preserves the existing primary-assignee removal path", async () => {
    expect((await request(app()).patch("/subtasks/sub-1").send({ assigneeId: null })).status).toBe(200);
    expect(mocks.updateSubtask).toHaveBeenCalledWith("sub-1", { assigneeId: null });
    expect(mocks.assignSubtask).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("handles subtask creation with an initial assignee", async () => {
    expect((await request(app()).post("/tasks/task-1/subtasks").send({ title: "Subtask", assigneeId: "daniel" })).status).toBe(201);
    expect(mocks.assignSubtask).toHaveBeenCalledWith(expect.objectContaining({ userId: "daniel", subtaskId: "sub-1" }), expect.anything());
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("handles assignments during task creation without adding in-app notifications", async () => {
    const response = await request(app()).post("/tasks").send({ title: "Load More", projectId: "project-1", assigneeIds: ["daniel"] });
    expect(response.status).toBe(201);
    expect(mocks.assign).toHaveBeenCalledWith(expect.objectContaining({ userId: "daniel", actorUserId: "ben" }), expect.anything());
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("only processes newly added assignees on task update", async () => {
    const response = await request(app()).patch("/tasks/task-1").send({ assigneeIds: ["existing", "daniel"] });
    expect(response.status).toBe(200);
    expect(mocks.assign).toHaveBeenCalledTimes(1);
    expect(mocks.assign).toHaveBeenCalledWith(expect.objectContaining({ userId: "daniel" }), expect.anything());
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.notifyStatus).not.toHaveBeenCalled();
  });
  it("handles assignments when creating child tasks", async () => {
    const response = await request(app()).post("/tasks/task-1/childtasks").send({ title: "Child", assigneeId: "daniel" });
    expect(response.status).toBe(201);
    expect(mocks.assign).toHaveBeenCalledWith(expect.objectContaining({ userId: "daniel", actorUserId: "ben" }), expect.anything());
  });
});

describe("project assignment email permission", () => {
  it("rejects employees changing the opt-in", async () => {
    const response = await request(app()).patch("/projects/project-1").send({ assignmentEmailsEnabled: true });
    expect(response.status).toBe(403);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });
  it.each(["admin", "project_manager"])("allows %s to change the opt-in", async (role) => {
    mocks.getUser.mockResolvedValue({ id: "ben", tenantId: "tenant-1", role });
    const response = await request(app(role)).patch("/projects/project-1").send({ assignmentEmailsEnabled: true });
    expect(response.status).toBe(200);
    expect(mocks.updateProject).toHaveBeenCalledWith("project-1", "tenant-1", { assignmentEmailsEnabled: true });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("rejects employees enabling emails through project creation", async () => {
    const response = await request(app()).post("/projects").send({ name: "Test", clientId: "client-1", assignmentEmailsEnabled: true });
    expect(response.status).toBe(403);
  });
});
