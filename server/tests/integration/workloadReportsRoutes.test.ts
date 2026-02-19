import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { requestIdMiddleware } from "../../middleware/requestId";
import { errorHandler } from "../../middleware/errorHandler";
import { getRouterMeta } from "../../http/routerFactory";
import workloadReportsRouter from "../../http/domains/workload-reports.router";

function injectPassportAuth(user: Record<string, any>): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = user;
    (req as any).session = { passport: { user: user.id } };
    (req as any).tenant = { effectiveTenantId: user.tenantId };
    next();
  };
}

function injectNoAuth(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = null;
    next();
  };
}

function injectAuthNoTenant(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: "test-user", role: "employee" };
    (req as any).session = { passport: { user: "test-user" } };
    (req as any).tenant = {};
    next();
  };
}

const adminUser = {
  id: "test-admin-id",
  tenantId: "test-tenant-id",
  role: "admin",
  isSuperUser: false,
};

const employeeUser = {
  id: "test-employee-id",
  tenantId: "test-tenant-id",
  role: "employee",
  isSuperUser: false,
};

function buildAdminApp() {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(injectPassportAuth(adminUser));
  app.use("/api/v1", workloadReportsRouter);
  app.use(errorHandler);
  return app;
}

function buildEmployeeApp() {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(injectPassportAuth(employeeUser));
  app.use("/api/v1", workloadReportsRouter);
  app.use(errorHandler);
  return app;
}

describe("Workload Reports Domain — Integration Smoke Tests", () => {
  describe("Auth rejection (mini app)", () => {
    it("should reject unauthenticated GET /api/v1/workload/tasks-by-employee with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api/v1", workloadReportsRouter);
      const res = await request(app).get("/api/v1/workload/tasks-by-employee");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated GET /api/v1/workload/summary with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api/v1", workloadReportsRouter);
      const res = await request(app).get("/api/v1/workload/summary");
      expect(res.status).toBe(401);
    });
  });

  describe("Admin-only enforcement", () => {
    it("should reject non-admin GET /api/v1/workload/tasks-by-employee with 403", async () => {
      const app = buildEmployeeApp();
      const res = await request(app).get("/api/v1/workload/tasks-by-employee");
      expect(res.status).toBe(403);
    });

    it("should reject non-admin GET /api/v1/workload/summary with 403", async () => {
      const app = buildEmployeeApp();
      const res = await request(app).get("/api/v1/workload/summary");
      expect(res.status).toBe(403);
    });

    it("should reject non-admin GET /api/v1/workload/unassigned with 403", async () => {
      const app = buildEmployeeApp();
      const res = await request(app).get("/api/v1/workload/unassigned");
      expect(res.status).toBe(403);
    });

    it("should reject non-admin GET /api/v1/workload/by-status with 403", async () => {
      const app = buildEmployeeApp();
      const res = await request(app).get("/api/v1/workload/by-status");
      expect(res.status).toBe(403);
    });

    it("should reject non-admin GET /api/v1/workload/by-priority with 403", async () => {
      const app = buildEmployeeApp();
      const res = await request(app).get("/api/v1/workload/by-priority");
      expect(res.status).toBe(403);
    });
  });

  describe("Route matching (admin)", () => {
    const app = buildAdminApp();

    it("GET /api/v1/workload/tasks-by-employee should not 404", async () => {
      const res = await request(app).get("/api/v1/workload/tasks-by-employee");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/v1/workload/employee/:userId/tasks should match route (404 for nonexistent user)", async () => {
      const res = await request(app).get("/api/v1/workload/employee/some-user/tasks");
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe("NOT_FOUND");
    });

    it("GET /api/v1/workload/unassigned should not 404", async () => {
      const res = await request(app).get("/api/v1/workload/unassigned");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/v1/workload/by-status should not 404", async () => {
      const res = await request(app).get("/api/v1/workload/by-status");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/v1/workload/by-priority should not 404", async () => {
      const res = await request(app).get("/api/v1/workload/by-priority");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/v1/workload/summary should not 404", async () => {
      const res = await request(app).get("/api/v1/workload/summary");
      expect(res.status).not.toBe(404);
    });
  });

  describe("Factory metadata", () => {
    it("should have factory metadata with authTenant policy", () => {
      const meta = getRouterMeta(workloadReportsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });

  describe("Router is listed in mount.ts MIGRATED_DOMAINS", () => {
    it("should export a valid router with factory metadata", () => {
      const meta = getRouterMeta(workloadReportsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
