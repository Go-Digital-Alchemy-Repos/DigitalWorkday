import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import uploadsRouter from "../../http/domains/uploads.router";

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

describe("Uploads Domain — Smoke Integration Tests", () => {
  describe("Auth rejection (2 tests)", () => {
    it("should reject unauthenticated GET /status with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app).get("/api/v1/uploads/status");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated POST /presign with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/presign")
        .send({ category: "task-attachment", filename: "test.pdf", contentType: "application/pdf", size: 100 });
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant enforcement (2 tests)", () => {
    it("should reject request without tenant context for GET /status", async () => {
      const app = express();
      app.use(express.json());

      const authNoTenant: RequestHandler = (req, _res, next) => {
        (req as any).isAuthenticated = () => true;
        (req as any).user = { id: "user1", role: "employee" };
        (req as any).session = { passport: { user: "user1" } };
        next();
      };

      app.use(authNoTenant);
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app).get("/api/v1/uploads/status");
      expect([400, 403]).toContain(res.status);
    });

    it("should reject POST /presign without tenant context", async () => {
      const app = express();
      app.use(express.json());

      const authNoTenant: RequestHandler = (req, _res, next) => {
        (req as any).isAuthenticated = () => true;
        (req as any).user = { id: "user1", role: "employee" };
        (req as any).session = { passport: { user: "user1" } };
        next();
      };

      app.use(authNoTenant);
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/presign")
        .send({ category: "task-attachment", filename: "test.pdf", contentType: "application/pdf", size: 100 });
      expect([400, 403]).toContain(res.status);
    });
  });

  describe("Route matching (3 tests)", () => {
    it("should route GET /status to handler (not express 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app).get("/api/v1/uploads/status");
      expect([200, 500]).toContain(res.status);
    });

    it("should route POST /presign to handler (not express 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/presign")
        .send({ category: "task-attachment", filename: "test.pdf", contentType: "application/pdf", size: 100 });
      expect([200, 400, 500, 503]).toContain(res.status);
    });

    it("should route POST /upload to handler (not express 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/upload")
        .field("category", "task-attachment");
      expect([400, 500, 503]).toContain(res.status);
    });
  });

  describe("Validation (2 tests)", () => {
    it("should return 400 for presign with missing required fields", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/presign")
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for presign with invalid category", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/presign")
        .send({ category: "nonexistent-category", filename: "test.pdf", contentType: "application/pdf", size: 100 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_CATEGORY");
    });
  });

  describe("Upload guard — enforce mode (2 tests)", () => {
    const originalEnv = process.env.UPLOAD_GUARDS_MODE;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.UPLOAD_GUARDS_MODE;
      } else {
        process.env.UPLOAD_GUARDS_MODE = originalEnv;
      }
    });

    it("in enforce mode, path traversal in filename should return 400", async () => {
      process.env.UPLOAD_GUARDS_MODE = "enforce";

      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/presign")
        .send({ category: "task-attachment", filename: "../../etc/passwd", contentType: "application/pdf", size: 100 });
      expect(res.status).toBe(400);
    });

    it("in warn mode (default), path traversal should not be blocked by guard (guard passes through)", async () => {
      delete process.env.UPLOAD_GUARDS_MODE;

      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api/v1/uploads", uploadsRouter);

      const res = await request(app)
        .post("/api/v1/uploads/presign")
        .send({ category: "profile-photo", filename: "../../etc/passwd", contentType: "image/png", size: 100 });
      // In warn mode the guard logs but does not block — request reaches the handler.
      // Handler may still return 400/500 for other reasons (e.g. storage not configured).
      // The key assertion: if enforce mode would return UPLOAD_GUARD_BLOCKED code, warn mode should NOT.
      if (res.status === 400) {
        expect(res.body.code).not.toBe("UPLOAD_GUARD_BLOCKED");
      }
    });
  });

  describe("Metadata registry (1 test)", () => {
    it("uploads router should have authTenant policy in factory metadata", () => {
      const meta = getRouterMeta(uploadsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });
});
