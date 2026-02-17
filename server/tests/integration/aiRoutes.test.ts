import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import aiRouter from "../../http/domains/ai.router";

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

describe("AI Domain — Smoke Integration Tests", () => {
  describe("Auth rejection", () => {
    it("should reject unauthenticated GET /v1/ai/status with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", aiRouter);

      const res = await request(app).get("/api/v1/ai/status");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated POST /v1/ai/suggest/task-breakdown with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", aiRouter);

      const res = await request(app)
        .post("/api/v1/ai/suggest/task-breakdown")
        .send({ taskTitle: "Test" });
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
      app.use("/api", aiRouter);

      const res = await request(app).get("/api/v1/ai/status");
      expect([400, 403]).toContain(res.status);
    });
  });

  describe("Route matching — happy path", () => {
    it("GET /v1/ai/status should return expected shape", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", aiRouter);

      const res = await request(app).get("/api/v1/ai/status");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("enabled");
      expect(res.body).toHaveProperty("isOperational");
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("Validation errors", () => {
    it("POST /v1/ai/suggest/task-breakdown with missing required field should return 400", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", aiRouter);

      const res = await request(app)
        .post("/api/v1/ai/suggest/task-breakdown")
        .send({});
      expect([400, 500]).toContain(res.status);
    });

    it("POST /v1/ai/suggest/project-plan with missing required field should return 400", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", aiRouter);

      const res = await request(app)
        .post("/api/v1/ai/suggest/project-plan")
        .send({});
      expect([400, 500]).toContain(res.status);
    });

    it("POST /v1/ai/suggest/task-description with missing required field should return 400", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", aiRouter);

      const res = await request(app)
        .post("/api/v1/ai/suggest/task-description")
        .send({});
      expect([400, 500]).toContain(res.status);
    });
  });

  describe("Metadata registry", () => {
    it("ai router should have authTenant policy in factory metadata", () => {
      const meta = getRouterMeta(aiRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });
});
