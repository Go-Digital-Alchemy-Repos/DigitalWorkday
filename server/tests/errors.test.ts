import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { AppError } from "../lib/errors";
import { errorHandler } from "../middleware/errorHandler";
import { asyncHandler } from "../middleware/asyncHandler";

describe("Error Handling", () => {
  it("should handle AppError correctly", async () => {
    const app = express();
    app.use(express.json());

    app.get(
      "/test-error",
      asyncHandler(async () => {
        throw AppError.badRequest("Test validation error", { field: "name" });
      })
    );

    app.use(errorHandler);

    const response = await request(app).get("/test-error");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Test validation error");
    expect(response.body.error.details).toEqual({ field: "name" });
  });

  it("should handle 404 errors correctly", async () => {
    const app = express();
    app.use(express.json());

    app.get(
      "/not-found",
      asyncHandler(async () => {
        throw AppError.notFound("Resource not found");
      })
    );

    app.use(errorHandler);

    const response = await request(app).get("/not-found");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("should handle 401 unauthorized errors correctly", async () => {
    const app = express();
    app.use(express.json());

    app.get(
      "/protected",
      asyncHandler(async () => {
        throw AppError.unauthorized();
      })
    );

    app.use(errorHandler);

    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("should handle generic errors safely in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const app = express();
    app.use(express.json());

    app.get(
      "/internal-error",
      asyncHandler(async () => {
        throw new Error("Sensitive database error details");
      })
    );

    app.use(errorHandler);

    const response = await request(app).get("/internal-error");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(response.body.error.message).toBe("Internal server error");
    expect(response.body.error.message).not.toContain("database");

    process.env.NODE_ENV = originalEnv;
  });
});
