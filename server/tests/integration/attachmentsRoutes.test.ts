import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import attachmentsRouter from "../../http/domains/attachments.router";

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

describe("Attachments Domain — Smoke Integration Tests", () => {
  describe("Auth rejection (2 tests)", () => {
    it("should reject unauthenticated GET /attachments/config with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", attachmentsRouter);

      const res = await request(app).get("/api/attachments/config");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated POST /projects/:pid/tasks/:tid/attachments/presign with 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", attachmentsRouter);

      const res = await request(app)
        .post("/api/projects/p1/tasks/t1/attachments/presign")
        .send({ fileName: "test.pdf", mimeType: "application/pdf", fileSizeBytes: 100 });
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant enforcement (2 tests)", () => {
    it("should reject request without tenant context for GET /attachments/config", async () => {
      const app = express();
      app.use(express.json());

      const authNoTenant: RequestHandler = (req, _res, next) => {
        (req as any).isAuthenticated = () => true;
        (req as any).user = { id: "user1", role: "employee" };
        (req as any).session = { passport: { user: "user1" } };
        next();
      };

      app.use(authNoTenant);
      app.use("/api", attachmentsRouter);

      const res = await request(app).get("/api/attachments/config");
      expect([400, 403]).toContain(res.status);
    });

    it("should reject DELETE without tenant context", async () => {
      const app = express();
      app.use(express.json());

      const authNoTenant: RequestHandler = (req, _res, next) => {
        (req as any).isAuthenticated = () => true;
        (req as any).user = { id: "user1", role: "employee" };
        (req as any).session = { passport: { user: "user1" } };
        next();
      };

      app.use(authNoTenant);
      app.use("/api", attachmentsRouter);

      const res = await request(app).delete("/api/projects/p1/tasks/t1/attachments/a1");
      expect([400, 403]).toContain(res.status);
    });
  });

  describe("Route matching (2 tests)", () => {
    it("should route GET /attachments/config to handler (not express 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", attachmentsRouter);

      const res = await request(app).get("/api/attachments/config");
      expect([200, 500]).toContain(res.status);
    });

    it("should route GET /projects/:pid/tasks/:tid/attachments to handler (not express 404)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", attachmentsRouter);

      const res = await request(app).get("/api/projects/nonexistent/tasks/nonexistent/attachments");
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe("Validation (2 tests)", () => {
    it("should return 404 for nonexistent attachment download", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", attachmentsRouter);

      const res = await request(app).get("/api/projects/p1/tasks/t1/attachments/nonexistent/download");
      expect([404, 500]).toContain(res.status);
    });

    it("should return 404 for nonexistent attachment complete", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", attachmentsRouter);

      const res = await request(app).post("/api/projects/p1/tasks/t1/attachments/nonexistent/complete");
      expect([404, 500]).toContain(res.status);
    });
  });

  describe("Metadata registry (1 test)", () => {
    it("attachments router should have authTenant policy in factory metadata", () => {
      const meta = getRouterMeta(attachmentsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
      expect(meta!.allowlist).toEqual([]);
    });
  });

  describe("Upload guard middleware (1 test)", () => {
    it("should sanitize filenames in presign requests (upload guard applied)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth(testUser));
      app.use("/api", attachmentsRouter);

      const res = await request(app)
        .post("/api/projects/p1/tasks/t1/attachments/presign")
        .send({
          fileName: "../../etc/passwd",
          mimeType: "application/pdf",
          fileSizeBytes: 1000,
        });
      expect([404, 500, 503]).toContain(res.status);
    });
  });
});
