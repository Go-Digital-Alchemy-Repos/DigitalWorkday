import { describe, it, expect } from "vitest";
import { getRouterMeta } from "../http/routerFactory";
import projectsRouter from "../http/domains/projects.router";
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
  app.use("/api", projectsRouter);
  return app;
}

describe("Projects Router – authTenant policy drift tests", () => {
  it("projects router factory metadata has authTenant policy", async () => {
    const meta = getRouterMeta(projectsRouter);
    expect(meta).toBeDefined();
    expect(meta!.policy).toBe("authTenant");
  });

  // Project CRUD
  it("GET /api/projects rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects");
    expect(res.status).toBe(401);
  });

  it("GET /api/projects/unassigned rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/unassigned");
    expect(res.status).toBe(401);
  });

  it("GET /api/projects/hidden rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/hidden");
    expect(res.status).toBe(401);
  });

  it("GET /api/projects/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/some-id");
    expect(res.status).toBe(401);
  });

  it("POST /api/projects rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .post("/api/projects")
      .send({ name: "Test" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/projects/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .patch("/api/projects/some-id")
      .send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  // Members
  it("GET /api/projects/:id/members rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/some-id/members");
    expect(res.status).toBe(401);
  });

  it("POST /api/projects/:id/members rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .post("/api/projects/some-id/members")
      .send({ userId: "user1" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/projects/:id/members/:userId rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .delete("/api/projects/some-id/members/user1");
    expect(res.status).toBe(401);
  });

  it("PUT /api/projects/:id/members rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .put("/api/projects/some-id/members")
      .send({ memberIds: ["user1"] });
    expect(res.status).toBe(401);
  });

  // Visibility
  it("POST /api/projects/:id/hide rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .post("/api/projects/some-id/hide");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/projects/:id/hide rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .delete("/api/projects/some-id/hide");
    expect(res.status).toBe(401);
  });

  it("GET /api/projects/:id/hidden rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/some-id/hidden");
    expect(res.status).toBe(401);
  });

  // Sections
  it("GET /api/projects/:id/sections rejects unauthenticated with 401", async () => {
    const res = await request(buildApp()).get("/api/projects/some-id/sections");
    expect(res.status).toBe(401);
  });

  it("POST /api/sections rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .post("/api/sections")
      .send({ name: "Section", projectId: "proj1" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/sections/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .patch("/api/sections/some-id")
      .send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/sections/:id rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .delete("/api/sections/some-id");
    expect(res.status).toBe(401);
  });

  // Task reorder
  it("PATCH /api/projects/:id/tasks/reorder rejects unauthenticated with 401", async () => {
    const res = await request(buildApp())
      .patch("/api/projects/some-id/tasks/reorder")
      .send({ moves: [] });
    expect(res.status).toBe(401);
  });
});
