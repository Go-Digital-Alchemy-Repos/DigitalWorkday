import { describe, it, expect } from "vitest";
import { getRouterMeta } from "../http/routerFactory";
import subtasksRouter from "../http/domains/subtasks.router";
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
  app.use("/api", subtasksRouter);
  return app;
}

describe("Subtasks Router – authTenant policy drift tests", () => {
  it("subtasks router factory metadata has authTenant policy", async () => {
    const meta = getRouterMeta(subtasksRouter);
    expect(meta).toBeDefined();
    expect(meta!.policy).toBe("authTenant");
  });

  it("GET /api/tasks/:taskId/subtasks rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/tasks/tid/subtasks");
    expect(res.status).toBe(401);
  });

  it("POST /api/tasks/:taskId/subtasks rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/tasks/tid/subtasks").send({ title: "sub" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/subtasks/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).patch("/api/subtasks/sid").send({ title: "upd" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/subtasks/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).delete("/api/subtasks/sid");
    expect(res.status).toBe(401);
  });

  it("POST /api/subtasks/:id/move rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/subtasks/sid/move").send({ targetIndex: 0 });
    expect(res.status).toBe(401);
  });

  it("GET /api/subtasks/:id/full rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/subtasks/sid/full");
    expect(res.status).toBe(401);
  });

  it("GET /api/subtasks/:id/assignees rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/subtasks/sid/assignees");
    expect(res.status).toBe(401);
  });

  it("POST /api/subtasks/:id/assignees rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/subtasks/sid/assignees").send({ userId: "u1" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/subtasks/:subtaskId/assignees/:userId rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).delete("/api/subtasks/sid/assignees/uid");
    expect(res.status).toBe(401);
  });

  it("GET /api/subtasks/:id/tags rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/subtasks/sid/tags");
    expect(res.status).toBe(401);
  });

  it("POST /api/subtasks/:id/tags rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/subtasks/sid/tags").send({ tagId: "t1" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/subtasks/:subtaskId/tags/:tagId rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).delete("/api/subtasks/sid/tags/tid");
    expect(res.status).toBe(401);
  });

  it("GET /api/subtasks/:subtaskId/comments rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/subtasks/sid/comments");
    expect(res.status).toBe(401);
  });

  it("POST /api/subtasks/:subtaskId/comments rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).post("/api/subtasks/sid/comments").send({ body: "test" });
    expect(res.status).toBe(401);
  });
});
