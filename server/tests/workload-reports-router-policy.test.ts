import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../http/routerFactory";
import workloadReportsRouter from "../http/domains/workload-reports.router";

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
  app.use("/api/v1", workloadReportsRouter);
  return app;
}

describe("Workload Reports Domain — Policy Drift Tests", () => {
  describe("Unauthenticated requests rejected (401)", () => {
    const app = buildUnauthApp();

    it("GET /api/v1/workload/tasks-by-employee → 401", async () => {
      const res = await request(app).get("/api/v1/workload/tasks-by-employee");
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/workload/employee/:userId/tasks → 401", async () => {
      const res = await request(app).get("/api/v1/workload/employee/test-user/tasks");
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/workload/unassigned → 401", async () => {
      const res = await request(app).get("/api/v1/workload/unassigned");
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/workload/by-status → 401", async () => {
      const res = await request(app).get("/api/v1/workload/by-status");
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/workload/by-priority → 401", async () => {
      const res = await request(app).get("/api/v1/workload/by-priority");
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/workload/summary → 401", async () => {
      const res = await request(app).get("/api/v1/workload/summary");
      expect(res.status).toBe(401);
    });
  });

  describe("Factory metadata", () => {
    it("should have authTenant policy via factory", () => {
      const meta = getRouterMeta(workloadReportsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
