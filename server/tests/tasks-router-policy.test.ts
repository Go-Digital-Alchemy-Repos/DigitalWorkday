import { describe, it, expect } from "vitest";
import { getRouterMeta } from "../http/routerFactory";
import tasksRouter from "../http/domains/tasks.router";
import express from "express";
import request from "supertest";
import type { RequestHandler } from "express";

function injectNoAuth(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = null;
    next();
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(injectNoAuth());
  app.use("/api", tasksRouter);
  return app;
}

describe("Tasks Router – authTenant policy drift tests", () => {
  it("tasks router factory metadata has authTenant policy", async () => {
    const meta = getRouterMeta(tasksRouter);
    expect(meta).toBeDefined();
    expect(meta!.policy).toBe("authTenant");
  });

  // Project-scoped task queries
  it("GET /api/projects/:projectId/tasks rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/pid/tasks");
    expect(res.status).toBe(401);
  });

  it("GET /api/projects/:projectId/calendar-events rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/pid/calendar-events");
    expect(res.status).toBe(401);
  });

  it("GET /api/projects/:projectId/activity rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/pid/activity");
    expect(res.status).toBe(401);
  });

  // Task CRUD
  it("GET /api/tasks/my rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/tasks/my");
    expect(res.status).toBe(401);
  });

  it("GET /api/tasks/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/tasks/some-id");
    expect(res.status).toBe(401);
  });

  it("GET /api/tasks/:id/childtasks rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/tasks/some-id/childtasks");
    expect(res.status).toBe(401);
  });

  it("POST /api/tasks rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/tasks").send({ title: "Test" });
    expect(res.status).toBe(401);
  });

  it("POST /api/tasks/personal rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/tasks/personal").send({ title: "Test" });
    expect(res.status).toBe(401);
  });

  it("POST /api/tasks/:taskId/childtasks rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/tasks/tid/childtasks").send({ title: "Test" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/tasks/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).patch("/api/tasks/some-id").send({ title: "Updated" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/tasks/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).delete("/api/tasks/some-id");
    expect(res.status).toBe(401);
  });

  it("POST /api/tasks/:id/move rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/tasks/some-id/move").send({});
    expect(res.status).toBe(401);
  });

  // Task Assignees
  it("POST /api/tasks/:taskId/assignees rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/tasks/tid/assignees").send({ userId: "u1" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/tasks/:taskId/assignees/:userId rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).delete("/api/tasks/tid/assignees/uid");
    expect(res.status).toBe(401);
  });

  // Task Watchers
  it("GET /api/tasks/:taskId/watchers rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/tasks/tid/watchers");
    expect(res.status).toBe(401);
  });

  it("POST /api/tasks/:taskId/watchers rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/tasks/tid/watchers").send({ userId: "u1" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/tasks/:taskId/watchers/:userId rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).delete("/api/tasks/tid/watchers/uid");
    expect(res.status).toBe(401);
  });

  // Personal Task Sections
  it("GET /api/v1/my-tasks/sections rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/v1/my-tasks/sections");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/my-tasks/sections rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/v1/my-tasks/sections").send({ name: "Test" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/v1/my-tasks/sections/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).patch("/api/v1/my-tasks/sections/sid").send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/my-tasks/sections/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).delete("/api/v1/my-tasks/sections/sid");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/my-tasks/tasks/:taskId/move rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/v1/my-tasks/tasks/tid/move").send({});
    expect(res.status).toBe(401);
  });
});
