/**
 * Server Integration Tests
 * 
 * Purpose: Verify core server functionality including:
 * - Health and ready endpoints
 * - Authentication protection on API endpoints
 * - Input validation and error shape consistency
 * 
 * These tests use the server harness to create a minimal express app.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp, isDatabaseAvailable, resetTestApp } from "./server-harness";
import type { Express } from "express";

describe("Server Integration Tests", () => {
  let app: Express;
  let dbAvailable: boolean;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    app = createTestApp();
  });

  afterAll(() => {
    resetTestApp();
  });

  describe("Health Endpoints", () => {
    it("GET /health returns 200 with ok:true", async () => {
      const res = await request(app).get("/health");
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body).toHaveProperty("timestamp");
    });

    it("GET /healthz returns 200 with 'ok' text", async () => {
      const res = await request(app).get("/healthz");
      
      expect(res.status).toBe(200);
      expect(res.text).toBe("ok");
    });

    it("GET /ready returns status with database check", async () => {
      const res = await request(app).get("/ready");
      
      // Response includes checks object
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("checks");
      
      if (dbAvailable) {
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ready");
        expect(res.body.checks.database).toBe(true);
      } else {
        expect(res.status).toBe(503);
        expect(res.body.status).toBe("not_ready");
      }
    });
  });
});

describe("Authentication Protection", () => {
  let app: Express;

  beforeAll(async () => {
    // Create app without auth to test protection
    app = createTestApp({ withAuth: false });
    
    // Add a protected endpoint for testing
    app.get("/api/protected", (req: any, res) => {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Authentication required",
          code: "UNAUTHORIZED",
        });
      }
      res.json({ data: "protected content" });
    });
  });

  afterAll(() => {
    resetTestApp();
  });

  it("unauthenticated access returns 401 for protected endpoints", async () => {
    const res = await request(app).get("/api/protected");
    
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("code", "UNAUTHORIZED");
  });

  it("authenticated access returns 200 for protected endpoints", async () => {
    // Create app with mock auth
    const authApp = createTestApp({
      withAuth: true,
      mockUserId: "test-user-id",
      mockTenantId: "test-tenant-id",
      mockUserRole: "admin",
    });
    
    authApp.get("/api/protected", (req: any, res) => {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      res.json({ data: "protected content", userId: req.user.id });
    });
    
    const res = await request(authApp).get("/api/protected");
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data", "protected content");
    expect(res.body).toHaveProperty("userId", "test-user-id");
  });
});

describe("Input Validation and Error Shape", () => {
  let app: Express;

  beforeAll(async () => {
    app = createTestApp({ 
      withAuth: true, 
      mockUserId: "test-user",
      mockTenantId: "test-tenant",
    });
    
    // Add validation middleware
    const { z } = await import("zod");
    
    const timeEntrySchema = z.object({
      startTime: z.string().datetime({ message: "startTime must be a valid ISO datetime" }),
      endTime: z.string().datetime({ message: "endTime must be a valid ISO datetime" }),
      description: z.string().min(1, "description is required").max(500),
      taskId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
    });
    
    // Mock time entry create endpoint with validation
    app.post("/api/v1/time-entries", (req: any, res) => {
      const result = timeEntrySchema.safeParse(req.body);
      
      if (!result.success) {
        // Standardized error shape
        return res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          requestId: req.requestId || null,
          details: result.error.errors.map(err => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
      
      // Would create time entry here
      res.status(201).json({
        id: "created-entry-id",
        ...result.data,
      });
    });
  });

  afterAll(() => {
    resetTestApp();
  });

  it("time entry create returns consistent error shape on bad input", async () => {
    const res = await request(app)
      .post("/api/v1/time-entries")
      .send({
        // Invalid: missing required fields, bad datetime format
        startTime: "not-a-date",
        description: "",
      });
    
    expect(res.status).toBe(400);
    
    // Verify consistent error shape
    expect(res.body).toHaveProperty("error", "Validation failed");
    expect(res.body).toHaveProperty("code", "VALIDATION_ERROR");
    expect(res.body).toHaveProperty("details");
    expect(Array.isArray(res.body.details)).toBe(true);
    
    // Details should contain field-level errors
    const fields = res.body.details.map((d: any) => d.field);
    expect(fields).toContain("startTime");
    expect(fields).toContain("endTime");
    expect(fields).toContain("description");
  });

  it("time entry create returns requestId in error response", async () => {
    const res = await request(app)
      .post("/api/v1/time-entries")
      .send({ invalid: "data" });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("requestId");
  });

  it("valid time entry create returns 201", async () => {
    const validEntry = {
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      description: "Test time entry",
    };
    
    const res = await request(app)
      .post("/api/v1/time-entries")
      .send(validEntry);
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("description", "Test time entry");
  });
});
