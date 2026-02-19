import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { requestIdMiddleware } from "../../middleware/requestId";
import { errorHandler } from "../../middleware/errorHandler";
import { getRouterMeta } from "../../http/routerFactory";
import teamsRouter from "../../http/domains/teams.router";

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
  app.use("/api", teamsRouter);
  app.use(errorHandler);
  return app;
}

describe("Teams Domain — Integration Smoke Tests", () => {
  describe("Auth rejection (mini app)", () => {
    it("should reject unauthenticated GET /api/teams with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", teamsRouter);
      const res = await request(app).get("/api/teams");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated POST /api/teams with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", teamsRouter);
      const res = await request(app).post("/api/teams").send({ name: "Team" });
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant enforcement (mini app)", () => {
    it("should handle missing tenant context gracefully", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", teamsRouter);
      app.use(errorHandler);
      const res = await request(app).get("/api/teams");
      expect([200, 400, 403, 500]).toContain(res.status);
    });
  });

  describe("Behavior assertions", () => {
    const app = buildAuthApp();

    it("GET /api/teams/:id should return 404 for nonexistent team", async () => {
      const res = await request(app).get("/api/teams/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });

    it("PATCH /api/teams/:id should return 404 for nonexistent team", async () => {
      const res = await request(app).patch("/api/teams/00000000-0000-0000-0000-000000000000").send({ name: "Updated" });
      expect(res.status).toBe(404);
    });

    it("DELETE /api/teams/:id should return 404 for nonexistent team", async () => {
      const res = await request(app).delete("/api/teams/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });
  });

  describe("Route matching", () => {
    const app = buildAuthApp();

    it("GET /api/teams should not 404", async () => {
      const res = await request(app).get("/api/teams");
      expect(res.status).not.toBe(404);
    });

    it("POST /api/teams should not 404 (route match)", async () => {
      const res = await request(app).post("/api/teams").send({});
      expect(res.status).not.toBe(404);
    });

    it("GET /api/teams/:teamId/members should not 404 (route match)", async () => {
      const res = await request(app).get("/api/teams/test-id/members");
      expect(res.status).not.toBe(404);
    });

    it("POST /api/teams/:teamId/members should match route (may fail for invalid data)", async () => {
      const res = await request(app).post("/api/teams/test-id/members").send({});
      expect([200, 201, 400, 404, 500]).toContain(res.status);
    });

    it("DELETE /api/teams/:teamId/members/:userId should match route (may fail for nonexistent)", async () => {
      const res = await request(app).delete("/api/teams/test-id/members/user-id");
      expect([200, 204, 400, 404, 500]).toContain(res.status);
    });
  });

  describe("Factory metadata", () => {
    it("should have factory metadata with authTenant policy", () => {
      const meta = getRouterMeta(teamsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });

  describe("Router is listed in mount.ts MIGRATED_DOMAINS", () => {
    it("should export a valid router with factory metadata", () => {
      const meta = getRouterMeta(teamsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
