import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../http/routerFactory";
import workspacesRouter from "../http/domains/workspaces.router";

function injectNoAuth(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = null;
    next();
  };
}

function buildUnauthApp() {
  const app = express();
  app.use(express.json());
  app.use(injectNoAuth());
  app.use("/api", workspacesRouter);
  return app;
}

describe("Workspaces Domain — Policy Drift Tests", () => {
  describe("Unauthenticated requests rejected (401)", () => {
    const app = buildUnauthApp();

    it("GET /api/workspaces → 401", async () => {
      const res = await request(app).get("/api/workspaces");
      expect(res.status).toBe(401);
    });

    it("GET /api/workspaces/current → 401", async () => {
      const res = await request(app).get("/api/workspaces/current");
      expect(res.status).toBe(401);
    });

    it("GET /api/workspaces/:id → 401", async () => {
      const res = await request(app).get("/api/workspaces/test-id");
      expect(res.status).toBe(401);
    });

    it("POST /api/workspaces → 401", async () => {
      const res = await request(app).post("/api/workspaces").send({ name: "Test" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/workspaces/:id → 401", async () => {
      const res = await request(app).patch("/api/workspaces/test-id").send({ name: "Updated" });
      expect(res.status).toBe(401);
    });

    it("GET /api/workspaces/:workspaceId/members → 401", async () => {
      const res = await request(app).get("/api/workspaces/test-id/members");
      expect(res.status).toBe(401);
    });

    it("POST /api/workspaces/:workspaceId/members → 401", async () => {
      const res = await request(app).post("/api/workspaces/test-id/members").send({ userId: "u1" });
      expect(res.status).toBe(401);
    });

    it("GET /api/workspace-members → 401", async () => {
      const res = await request(app).get("/api/workspace-members");
      expect(res.status).toBe(401);
    });
  });

  describe("Factory metadata", () => {
    it("should have authTenant policy via factory", () => {
      const meta = getRouterMeta(workspacesRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
