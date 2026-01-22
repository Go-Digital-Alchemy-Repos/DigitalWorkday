/**
 * @module server/tests/standard-error-codes.test.ts
 * @description Tests for standard error codes (FORBIDDEN, NOT_FOUND, etc.)
 * 
 * Verifies:
 * 1. Standard error codes are consistent across all error types
 * 2. HTTP status codes match the expected values
 * 3. Error codes are stable for client parsing
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId";
import { errorHandler } from "../middleware/errorHandler";
import { AppError } from "../lib/errors";

function createTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  return app;
}

describe("Standard Error Codes", () => {
  describe("FORBIDDEN (403)", () => {
    it("should return FORBIDDEN code with 403 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.forbidden("Access denied"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.status).toBe(403);
    });

    it("should use default message if not provided", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.forbidden());
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe("Access denied");
    });
  });

  describe("NOT_FOUND (404)", () => {
    it("should return NOT_FOUND code with 404 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.notFound("User"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(res.body.error.status).toBe(404);
      expect(res.body.error.message).toBe("User not found");
    });

    it("should use default 'Resource' if not specified", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.notFound());
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.body.error.message).toBe("Resource not found");
    });
  });

  describe("UNAUTHORIZED (401)", () => {
    it("should return UNAUTHORIZED code with 401 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.unauthorized());
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(res.body.error.status).toBe(401);
      expect(res.body.error.message).toBe("Authentication required");
    });
  });

  describe("VALIDATION_ERROR (400)", () => {
    it("should return VALIDATION_ERROR code with 400 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.badRequest("Invalid input", { field: "email" }));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.status).toBe(400);
      expect(res.body.error.details).toEqual({ field: "email" });
    });
  });

  describe("CONFLICT (409)", () => {
    it("should return CONFLICT code with 409 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.conflict("Resource already exists"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.status).toBe(409);
    });
  });

  describe("TENANT_REQUIRED (400)", () => {
    it("should return TENANT_REQUIRED code with 400 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.tenantRequired());
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("TENANT_REQUIRED");
      expect(res.body.error.status).toBe(400);
    });
  });

  describe("TENANCY_VIOLATION (403)", () => {
    it("should return TENANCY_VIOLATION code with 403 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.tenancyViolation("Cross-tenant access attempt"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("TENANCY_VIOLATION");
      expect(res.body.error.status).toBe(403);
    });
  });

  describe("RATE_LIMITED (429)", () => {
    it("should return RATE_LIMITED code with 429 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.rateLimited());
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("RATE_LIMITED");
      expect(res.body.error.status).toBe(429);
    });
  });

  describe("AGREEMENT_REQUIRED (451)", () => {
    it("should return AGREEMENT_REQUIRED code with 451 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.agreementRequired("Accept terms", "/terms"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(451);
      expect(res.body.error.code).toBe("AGREEMENT_REQUIRED");
      expect(res.body.error.status).toBe(451);
      expect(res.body.error.details).toEqual({ redirectTo: "/terms" });
    });
  });

  describe("INTERNAL_ERROR (500)", () => {
    it("should return INTERNAL_ERROR code with 500 status", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.internal());
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(res.body.error.status).toBe(500);
    });

    it("should hide error details in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      
      const app = createTestApp();
      app.get("/test", () => {
        throw new Error("Database connection string: postgres://user:pass@host");
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe("Internal server error");
      expect(res.body.error.message).not.toContain("postgres");
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});

describe("Error Code Stability", () => {
  it("should use string error codes (not numeric)", async () => {
    const app = createTestApp();
    
    const errorTypes = [
      () => AppError.badRequest("test"),
      () => AppError.unauthorized(),
      () => AppError.forbidden(),
      () => AppError.notFound(),
      () => AppError.conflict("test"),
      () => AppError.internal(),
      () => AppError.tenantRequired(),
      () => AppError.rateLimited(),
    ];

    for (const createError of errorTypes) {
      const error = createError();
      expect(typeof error.code).toBe("string");
      expect(error.code).toMatch(/^[A-Z_]+$/);
    }
  });

  it("should include all required envelope fields", async () => {
    const app = createTestApp();
    app.get("/test", (req, res, next) => {
      next(AppError.badRequest("Test"));
    });
    app.use(errorHandler);

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "envelope-test");

    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
    expect(res.body.error).toHaveProperty("status");
    expect(res.body.error).toHaveProperty("requestId");
    expect(res.body.error.requestId).toBe("envelope-test");
  });
});
