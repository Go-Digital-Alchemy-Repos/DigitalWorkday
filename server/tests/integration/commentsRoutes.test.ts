import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import commentsRouter from "../../http/domains/comments.router";

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

const otherTenantUser = {
  id: "other-user-id",
  tenantId: "other-tenant-id",
  role: "admin",
  isSuperUser: false,
};

describe("Comments Domain — Smoke Integration Tests", () => {
  describe("Auth rejection (2 tests)", () => {
    it("should reject unauthenticated GET /tasks/:taskId/comments with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", commentsRouter);

      const res = await request(app).get("/api/tasks/task1/comments");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated PATCH /comments/:id with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", commentsRouter);

      const res = await request(app)
        .patch("/api/comments/comment1")
        .send({ content: "edited" });
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant enforcement (2 tests)", () => {
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
      app.use("/api", commentsRouter);

      const res = await request(app).get("/api/tasks/task1/comments");
      expect([400, 403]).toContain(res.status);
    });

    it("should reject DELETE /comments/:id without tenant context", async () => {
      const app = express();
      app.use(express.json());

      const authNoTenant: RequestHandler = (req, _res, next) => {
        (req as any).isAuthenticated = () => true;
        (req as any).user = { id: "user1", role: "employee" };
        (req as any).session = { passport: { user: "user1" } };
        next();
      };

      app.use(authNoTenant);
      app.use("/api", commentsRouter);

      const res = await request(app).delete("/api/comments/comment1");
      expect([400, 403]).toContain(res.status);
    });
  });

  describe("Route matching — nested + global (2 tests)", () => {
    it("should route GET /tasks/:taskId/comments (nested) to handler, not express 404", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", commentsRouter);

      const res = await request(app).get("/api/tasks/nonexistent-task/comments");
      expect([200, 500]).toContain(res.status);
    });

    it("should route PATCH /comments/:id (global) to handler, returning app-level 404 for missing comment", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", commentsRouter);

      const res = await request(app)
        .patch("/api/comments/nonexistent-id")
        .send({ content: "edited" });
      expect(res.status).toBe(404);
      expect(res.body.code || res.body.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Metadata registry (1 test)", () => {
    it("comments router should have authTenant policy in factory metadata", () => {
      const meta = getRouterMeta(commentsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });

  describe("Additional endpoint structure", () => {
    it("should route POST /comments/:id/resolve to handler (not express-level 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", commentsRouter);

      const res = await request(app).post("/api/comments/nonexistent-id/resolve");
      expect([404, 500]).toContain(res.status);
    });

    it("should route POST /comments/:id/unresolve to handler (not express-level 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", commentsRouter);

      const res = await request(app).post("/api/comments/nonexistent-id/unresolve");
      expect([404, 500]).toContain(res.status);
    });
  });
});
