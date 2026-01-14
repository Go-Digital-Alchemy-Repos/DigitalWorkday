/**
 * @module server/__tests__/errorHandling.test.ts
 * @description Tests for the standardized API error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import { AppError, handleRouteError, sendError } from "../lib/errors";
import { errorHandler } from "../middleware/errorHandler";
import { requestIdMiddleware } from "../middleware/requestId";
import { ZodError, z } from "zod";

function createTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  return app;
}

describe("Request ID Middleware", () => {
  it("should generate a request ID if not provided", async () => {
    const app = createTestApp();
    app.get("/test", (req, res) => {
      res.json({ requestId: req.requestId });
    });

    const res = await request(app).get("/test");
    
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBeDefined();
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("should use provided X-Request-Id header", async () => {
    const app = createTestApp();
    app.get("/test", (req, res) => {
      res.json({ requestId: req.requestId });
    });

    const customId = "custom-request-id-123";
    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", customId);
    
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe(customId);
    expect(res.headers["x-request-id"]).toBe(customId);
  });
});

describe("AppError Class", () => {
  it("should create bad request error with correct properties", () => {
    const error = AppError.badRequest("Invalid email", { field: "email" });
    
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid email");
    expect(error.details).toEqual({ field: "email" });
  });

  it("should create not found error", () => {
    const error = AppError.notFound("Resource");
    
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Resource not found");
  });

  it("should create agreement required error with redirect", () => {
    const error = AppError.agreementRequired("Accept terms", "/terms");
    
    expect(error.statusCode).toBe(451);
    expect(error.code).toBe("AGREEMENT_REQUIRED");
    expect(error.details).toEqual({ redirectTo: "/terms" });
  });

  it("should create tenant required error", () => {
    const error = AppError.tenantRequired();
    
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("TENANT_REQUIRED");
  });

  it("should create rate limited error", () => {
    const error = AppError.rateLimited();
    
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
  });
});

describe("Error Handler Middleware", () => {
  it("should format AppError with standard envelope", async () => {
    const app = createTestApp();
    app.get("/test", (req, res, next) => {
      next(AppError.notFound("Item"));
    });
    app.use(errorHandler);

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "test-req-1");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Item not found",
        status: 404,
        requestId: "test-req-1",
      },
      // Legacy compatibility
      message: "Item not found",
      code: "NOT_FOUND",
    });
  });

  it("should format ZodError with validation details", async () => {
    const app = createTestApp();
    const schema = z.object({ email: z.string().email() });
    
    app.post("/test", (req, res, next) => {
      try {
        schema.parse(req.body);
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    });
    app.use(errorHandler);

    const res = await request(app)
      .post("/test")
      .send({ email: "invalid" })
      .set("X-Request-Id", "test-req-2");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.requestId).toBe("test-req-2");
    expect(res.body.error.details).toBeDefined();
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("should handle generic errors with INTERNAL_ERROR", async () => {
    const app = createTestApp();
    app.get("/test", () => {
      throw new Error("Something broke");
    });
    app.use(errorHandler);

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "test-req-3");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.requestId).toBe("test-req-3");
  });
});

describe("sendError Helper", () => {
  it("should send standardized error response", async () => {
    const app = createTestApp();
    app.get("/test", (req, res) => {
      sendError(res, AppError.forbidden("Access denied"), req);
    });

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "send-test-1");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: "FORBIDDEN",
      message: "Access denied",
      status: 403,
      requestId: "send-test-1",
    });
  });
});

describe("handleRouteError Helper", () => {
  it("should handle AppError", async () => {
    const app = createTestApp();
    app.get("/test", (req, res) => {
      try {
        throw AppError.conflict("Resource conflict");
      } catch (error) {
        handleRouteError(res, error, "testRoute", req);
      }
    });

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "route-test-1");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("should handle generic errors", async () => {
    const app = createTestApp();
    app.get("/test", (req, res) => {
      try {
        throw new Error("Unexpected error");
      } catch (error) {
        handleRouteError(res, error, "testRoute", req);
      }
    });

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "route-test-2");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.requestId).toBe("route-test-2");
  });
});

describe("X-Request-Id Header in Responses", () => {
  it("should always include X-Request-Id in response headers", async () => {
    const app = createTestApp();
    app.get("/success", (req, res) => {
      res.json({ ok: true });
    });
    app.get("/error", (req, res, next) => {
      next(AppError.badRequest("Bad"));
    });
    app.use(errorHandler);

    const successRes = await request(app).get("/success");
    expect(successRes.headers["x-request-id"]).toBeDefined();

    const errorRes = await request(app).get("/error");
    expect(errorRes.headers["x-request-id"]).toBeDefined();
  });
});
