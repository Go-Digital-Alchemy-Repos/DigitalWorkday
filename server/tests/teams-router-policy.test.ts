import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../http/routerFactory";
import teamsRouter from "../http/domains/teams.router";

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
  app.use("/api", teamsRouter);
  return app;
}

describe("Teams Domain — Policy Drift Tests", () => {
  describe("Unauthenticated requests rejected (401)", () => {
    const app = buildUnauthApp();

    it("GET /api/teams → 401", async () => {
      const res = await request(app).get("/api/teams");
      expect(res.status).toBe(401);
    });

    it("GET /api/teams/:id → 401", async () => {
      const res = await request(app).get("/api/teams/test-id");
      expect(res.status).toBe(401);
    });

    it("POST /api/teams → 401", async () => {
      const res = await request(app).post("/api/teams").send({ name: "Team" });
      expect(res.status).toBe(401);
    });

    it("GET /api/teams/:teamId/members → 401", async () => {
      const res = await request(app).get("/api/teams/test-id/members");
      expect(res.status).toBe(401);
    });

    it("POST /api/teams/:teamId/members → 401", async () => {
      const res = await request(app).post("/api/teams/test-id/members").send({ userId: "u1" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/teams/:id → 401", async () => {
      const res = await request(app).patch("/api/teams/test-id").send({ name: "Updated" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/teams/:id → 401", async () => {
      const res = await request(app).delete("/api/teams/test-id");
      expect(res.status).toBe(401);
    });

    it("DELETE /api/teams/:teamId/members/:userId → 401", async () => {
      const res = await request(app).delete("/api/teams/test-id/members/user-id");
      expect(res.status).toBe(401);
    });
  });

  describe("Factory metadata", () => {
    it("should have authTenant policy via factory", () => {
      const meta = getRouterMeta(teamsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
