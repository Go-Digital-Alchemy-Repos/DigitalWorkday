/**
 * @module server/tests/legacy-error-shapes.test.ts
 * @description Tests to verify that legacy error response shapes are preserved.
 * 
 * CRITICAL: These tests ensure backward compatibility with existing frontend code.
 * Changes to these tests require careful review to avoid breaking clients.
 * 
 * Verifies:
 * 1. Legacy { error: "..." } shape is preserved alongside standard envelope
 * 2. Specific endpoints return exact legacy shapes
 * 3. New error fields are additive only
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId";
import { errorHandler } from "../middleware/errorHandler";
import { AppError, sendError, handleRouteError } from "../lib/errors";
import { ZodError, z } from "zod";

function createTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  return app;
}

describe("Legacy Error Shape Preservation", () => {
  describe("Standard Envelope with Legacy Fields", () => {
    it("should include legacy 'message' field at root level", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.notFound("Resource"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");
      
      expect(res.status).toBe(404);
      // New standard envelope
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(res.body.error.message).toBe("Resource not found");
      // Legacy compatibility field
      expect(res.body.message).toBe("Resource not found");
      expect(res.body.code).toBe("NOT_FOUND");
    });

    it("should include legacy 'code' field at root level", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.forbidden("Access denied"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should include legacy 'details' field at root level", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.badRequest("Validation failed", { field: "email" }));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");
      
      expect(res.status).toBe(400);
      // Both locations should have details
      expect(res.body.details).toEqual({ field: "email" });
      expect(res.body.error.details).toEqual({ field: "email" });
    });
  });

  describe("ZodError Legacy Shape", () => {
    it("should format Zod validation errors with legacy fields", async () => {
      const app = createTestApp();
      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(2),
      });

      app.post("/test", (req, res, next) => {
        try {
          schema.parse(req.body);
          res.json({ ok: true });
        } catch (err) {
          next(err);
        }
      });
      app.use(errorHandler);

      const res = await request(app)
        .post("/test")
        .send({ email: "not-valid", name: "a" });

      expect(res.status).toBe(400);
      // Standard envelope
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details).toBeDefined();
      // Legacy fields
      expect(res.body.message).toBe("Validation failed");
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(res.body.details).toBeDefined();
    });
  });

  describe("Internal Error Legacy Shape", () => {
    it("should return internal error with legacy shape", async () => {
      const app = createTestApp();
      app.get("/test", () => {
        throw new Error("Database connection failed");
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      // Standard envelope
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      // Legacy fields
      expect(res.body.code).toBe("INTERNAL_ERROR");
      expect(res.body.message).toBeDefined();
    });
  });

  describe("sendError Helper Preserves Legacy Shape", () => {
    it("should include both standard envelope and legacy fields", async () => {
      const app = createTestApp();
      app.get("/test", (req, res) => {
        sendError(res, AppError.tenantRequired("Tenant context required"), req);
      });

      const res = await request(app).get("/test");

      expect(res.status).toBe(400);
      // Standard envelope
      expect(res.body.error).toMatchObject({
        code: "TENANT_REQUIRED",
        message: "Tenant context required",
        status: 400,
      });
      // Legacy fields
      expect(res.body.message).toBe("Tenant context required");
      expect(res.body.code).toBe("TENANT_REQUIRED");
    });
  });

  describe("handleRouteError Helper Preserves Legacy Shape", () => {
    it("should include legacy fields for AppError", async () => {
      const app = createTestApp();
      app.get("/test", (req, res) => {
        try {
          throw AppError.conflict("Resource already exists");
        } catch (err) {
          handleRouteError(res, err, "test", req);
        }
      });

      const res = await request(app).get("/test");

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.message).toBe("Resource already exists");
      expect(res.body.code).toBe("CONFLICT");
    });

    it("should include legacy fields for generic errors", async () => {
      const app = createTestApp();
      app.get("/test", (req, res) => {
        try {
          throw new Error("Something went wrong");
        } catch (err) {
          handleRouteError(res, err, "test", req);
        }
      });

      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(res.body.message).toBe("Internal server error");
      expect(res.body.code).toBe("INTERNAL_ERROR");
    });
  });
});

describe("Request ID Always Present", () => {
  it("should always include requestId in error.requestId", async () => {
    const app = createTestApp();
    app.get("/test", (req, res, next) => {
      next(AppError.badRequest("Bad request"));
    });
    app.use(errorHandler);

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "custom-id-123");

    expect(res.body.error.requestId).toBe("custom-id-123");
    expect(res.headers["x-request-id"]).toBe("custom-id-123");
  });

  it("should generate requestId if not provided", async () => {
    const app = createTestApp();
    app.get("/test", (req, res, next) => {
      next(AppError.unauthorized());
    });
    app.use(errorHandler);

    const res = await request(app).get("/test");

    expect(res.body.error.requestId).toBeDefined();
    expect(res.body.error.requestId).not.toBe("unknown");
    expect(res.headers["x-request-id"]).toBe(res.body.error.requestId);
  });
});
