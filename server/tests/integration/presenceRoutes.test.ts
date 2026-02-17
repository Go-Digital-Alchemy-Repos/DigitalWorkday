import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import presenceRouter from "../../http/domains/presence.router";

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

const testUser = {
  id: "test-user-id",
  tenantId: "test-tenant-id",
  role: "admin",
  isSuperUser: false,
};

describe("Presence Domain — Smoke Integration Tests", () => {
  describe("Auth rejection", () => {
    it("should reject unauthenticated GET /v1/presence with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", presenceRouter);

      const res = await request(app).get("/api/v1/presence");
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant enforcement", () => {
    it("should reject request without tenant context (auth only, no tenant)", async () => {
      const app = express();
      app.use(express.json());

      const authNoTenant: RequestHandler = (req, _res, next) => {
        (req as any).isAuthenticated = () => true;
        (req as any).user = { id: "user1", role: "employee" };
        (req as any).session = { passport: { user: "user1" } };
        next();
      };

      app.use(authNoTenant);
      app.use("/api", presenceRouter);

      const res = await request(app).get("/api/v1/presence");
      expect([400, 403]).toContain(res.status);
    });
  });

  describe("Route matching", () => {
    it("should route GET /v1/presence to handler and return an array", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", presenceRouter);

      const res = await request(app).get("/api/v1/presence");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should accept userIds query parameter", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", presenceRouter);

      const res = await request(app).get("/api/v1/presence?userIds=user1,user2");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("Metadata registry", () => {
    it("presence router should have authTenant policy in factory metadata", () => {
      const meta = getRouterMeta(presenceRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });
});
