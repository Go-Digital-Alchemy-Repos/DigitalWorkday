import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import tagsRouter from "../../http/domains/tags.router";

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

describe("Tags Domain — Smoke Integration Tests", () => {
  describe("Policy enforcement", () => {
    it("should reject unauthenticated requests via factory authTenant policy", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", tagsRouter);

      const res = await request(app).get("/api/workspaces/test-ws/tags");
      expect(res.status).toBe(401);
    });

    it("should reach handler when authenticated with tenant context", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", tagsRouter);

      const res = await request(app).get("/api/workspaces/nonexistent-workspace/tags");
      expect([200, 500]).toContain(res.status);
    });

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
      app.use("/api", tagsRouter);

      const res = await request(app).get("/api/workspaces/ws1/tags");
      expect([400, 403]).toContain(res.status);
    });
  });

  describe("Router factory metadata", () => {
    it("tags router should have authTenant policy in factory metadata", () => {
      const meta = getRouterMeta(tagsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });

  describe("Endpoint structure", () => {
    it("should route GET /workspaces/:id/tags to handler (returns 200 or 500, not express 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", tagsRouter);

      const res = await request(app).get("/api/workspaces/ws1/tags");
      expect([200, 500]).toContain(res.status);
    });

    it("should route PATCH /tags/:id to handler (returns app-level 404 for missing tag)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", tagsRouter);

      const res = await request(app)
        .patch("/api/tags/nonexistent-id")
        .send({ name: "updated-tag" });
      expect(res.status).toBe(404);
      expect(res.body.code || res.body.error?.code).toBe("NOT_FOUND");
    });

    it("should route POST /tasks/:taskId/tags to handler (not express 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", tagsRouter);

      const res = await request(app)
        .post("/api/tasks/task1/tags")
        .send({ tagId: "tag1" });
      expect(res.status).not.toBe(404);
    });
  });
});
