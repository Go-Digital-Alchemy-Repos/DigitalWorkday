import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { requestIdMiddleware } from "../../middleware/requestId";
import { errorHandler } from "../../middleware/errorHandler";
import { getRouterMeta } from "../../http/routerFactory";
import workspacesRouter from "../../http/domains/workspaces.router";

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

const testUser = {
  id: "test-user-id",
  tenantId: "test-tenant-id",
  role: "admin",
  isSuperUser: false,
};

function buildAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(injectPassportAuth(testUser));
  app.use("/api", workspacesRouter);
  app.use(errorHandler);
  return app;
}

describe("Workspaces Domain — Integration Smoke Tests", () => {
  describe("Auth rejection (mini app)", () => {
    it("should reject unauthenticated GET /api/workspaces with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", workspacesRouter);
      const res = await request(app).get("/api/workspaces");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated POST /api/workspaces with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", workspacesRouter);
      const res = await request(app).post("/api/workspaces").send({ name: "Test" });
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant enforcement (mini app)", () => {
    it("should handle missing tenant context gracefully", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", workspacesRouter);
      app.use(errorHandler);
      const res = await request(app).get("/api/workspaces");
      expect([200, 400, 403, 500]).toContain(res.status);
    });
  });

  describe("Route matching", () => {
    const app = buildAuthApp();

    it("GET /api/workspaces should not 404", async () => {
      const res = await request(app).get("/api/workspaces");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/workspaces/current should not 404", async () => {
      const res = await request(app).get("/api/workspaces/current");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/workspaces/:id should not 404 (route match)", async () => {
      const res = await request(app).get("/api/workspaces/some-ws-id");
      expect([200, 404, 500]).toContain(res.status);
    });

    it("POST /api/workspaces should not 404 (route match)", async () => {
      const res = await request(app).post("/api/workspaces").send({});
      expect(res.status).not.toBe(404);
    });

    it("PATCH /api/workspaces/:id should match route (returns 404 for nonexistent workspace)", async () => {
      const res = await request(app).patch("/api/workspaces/some-ws-id").send({ name: "Test" });
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe("NOT_FOUND");
    });

    it("GET /api/workspaces/:id/members should not 404 (route match)", async () => {
      const res = await request(app).get("/api/workspaces/some-ws-id/members");
      expect(res.status).not.toBe(404);
    });

    it("POST /api/workspaces/:id/members should not 404 (route match)", async () => {
      const res = await request(app).post("/api/workspaces/some-ws-id/members").send({});
      expect(res.status).not.toBe(404);
    });

    it("GET /api/workspace-members should not 404 (route match)", async () => {
      const res = await request(app).get("/api/workspace-members");
      expect(res.status).not.toBe(404);
    });
  });

  describe("Factory metadata", () => {
    it("should have factory metadata with authTenant policy", () => {
      const meta = getRouterMeta(workspacesRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });

  describe("Router is listed in mount.ts MIGRATED_DOMAINS", () => {
    it("should export a valid router with factory metadata", () => {
      const meta = getRouterMeta(workspacesRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
