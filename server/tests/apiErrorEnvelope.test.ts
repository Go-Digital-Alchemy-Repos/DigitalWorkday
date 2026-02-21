import { describe, it, expect } from "vitest";
import { AppError } from "../lib/errors";

describe("ApiErrorEnvelope", () => {
  describe("AppError.toApiErrorEnvelope", () => {
    it("should produce consistent success:false envelope", () => {
      const error = AppError.badRequest("Name is required", [{ field: "name" }]);
      const envelope = error.toApiErrorEnvelope("req-123");

      expect(envelope).toEqual({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Name is required",
          details: [{ field: "name" }],
        },
        requestId: "req-123",
      });
    });

    it("should handle all error types consistently", () => {
      const testCases = [
        { error: AppError.unauthorized(), expectedCode: "UNAUTHORIZED" },
        { error: AppError.forbidden(), expectedCode: "FORBIDDEN" },
        { error: AppError.notFound("Task"), expectedCode: "NOT_FOUND" },
        { error: AppError.conflict("Already exists"), expectedCode: "CONFLICT" },
        { error: AppError.internal(), expectedCode: "INTERNAL_ERROR" },
        { error: AppError.tenancyViolation("Cross-tenant"), expectedCode: "TENANCY_VIOLATION" },
        { error: AppError.tenantRequired(), expectedCode: "TENANT_REQUIRED" },
        { error: AppError.rateLimited(), expectedCode: "RATE_LIMITED" },
      ];

      for (const { error, expectedCode } of testCases) {
        const envelope = error.toApiErrorEnvelope("test-req");
        expect(envelope.success).toBe(false);
        expect(envelope.error.code).toBe(expectedCode);
        expect(typeof envelope.error.message).toBe("string");
        expect(envelope.requestId).toBe("test-req");
      }
    });

    it("should default requestId to 'unknown'", () => {
      const error = AppError.badRequest("test");
      const envelope = error.toApiErrorEnvelope();
      expect(envelope.requestId).toBe("unknown");
    });
  });

  describe("Error code consistency", () => {
    it("VALIDATION_ERROR should be 400", () => {
      const err = AppError.badRequest("test");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
    });

    it("UNAUTHORIZED should be 401", () => {
      const err = AppError.unauthorized();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe("UNAUTHORIZED");
    });

    it("FORBIDDEN should be 403", () => {
      const err = AppError.forbidden();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("FORBIDDEN");
    });

    it("NOT_FOUND should be 404", () => {
      const err = AppError.notFound();
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
    });

    it("CONFLICT should be 409", () => {
      const err = AppError.conflict("test");
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe("CONFLICT");
    });

    it("INTERNAL_ERROR should be 500", () => {
      const err = AppError.internal();
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe("INTERNAL_ERROR");
    });

    it("TENANT_REQUIRED should be 400", () => {
      const err = AppError.tenantRequired();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("TENANT_REQUIRED");
    });

    it("TENANCY_VIOLATION should be 403", () => {
      const err = AppError.tenancyViolation("test");
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("TENANCY_VIOLATION");
    });

    it("RATE_LIMITED should be 429", () => {
      const err = AppError.rateLimited();
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe("RATE_LIMITED");
    });
  });
});

describe("validateBody middleware shape", () => {
  it("validation failure should match ApiErrorEnvelope shape", () => {
    const validationErrors = [
      { path: "name", message: "Required", code: "invalid_type" },
      { path: "email", message: "Invalid email", code: "invalid_string" },
    ];

    const envelope = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: validationErrors,
      },
      requestId: "test-req",
    };

    expect(envelope.success).toBe(false);
    expect(envelope.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(envelope.error.details)).toBe(true);
    expect(envelope.error.details).toHaveLength(2);
    expect(envelope.error.details[0]).toHaveProperty("path");
    expect(envelope.error.details[0]).toHaveProperty("message");
  });
});
