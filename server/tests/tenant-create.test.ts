/**
 * @module server/tests/tenant-create.test.ts
 * @description Regression tests for tenant creation endpoint.
 * 
 * Tests:
 * 1. Success path: creates tenant with primary workspace
 * 2. Super user can create tenant without effectiveTenantId
 * 3. Response includes X-Request-Id header on failure
 * 4. Duplicate slug handling returns 409
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { randomUUID } from "crypto";
import { 
  setupTestFixtures, 
  cleanupTestFixtures, 
  TestContext 
} from "./fixtures";
import { requestIdMiddleware } from "../middleware/requestId";

describe("Tenant Creation", () => {
  let ctx: TestContext;
  let app: express.Express;
  let superAgent: request.Agent;

  beforeAll(async () => {
    ctx = await setupTestFixtures({
      createSuperUser: true,
      createTenant: false,
    });

    app = ctx.app;
    superAgent = ctx.superAgent!;
  });

  afterAll(async () => {
    await cleanupTestFixtures(ctx);
  });

  describe("POST /api/v1/super/tenants", () => {
    it("creates tenant successfully with primary workspace", async () => {
      const uniqueSlug = `test-tenant-${Date.now()}`;
      
      const response = await superAgent
        .post("/api/v1/super/tenants")
        .send({
          name: "Test Tenant Inc",
          slug: uniqueSlug,
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Test Tenant Inc");
      expect(response.body.slug).toBe(uniqueSlug);
      expect(response.body.status).toBe("inactive");
      expect(response.body.primaryWorkspaceId).toBeDefined();
      expect(response.body.primaryWorkspace).toBeDefined();
      expect(response.body.primaryWorkspace.name).toBe("Test Tenant Inc");
    });

    it("creates tenant without requiring effectiveTenantId (super user)", async () => {
      const uniqueSlug = `super-tenant-${Date.now()}`;
      
      const response = await superAgent
        .post("/api/v1/super/tenants")
        .send({
          name: "Super Created Tenant",
          slug: uniqueSlug,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
    });

    it("includes X-Request-Id header in response", async () => {
      const uniqueSlug = `requestid-test-${Date.now()}`;
      
      const response = await superAgent
        .post("/api/v1/super/tenants")
        .send({
          name: "Request ID Test",
          slug: uniqueSlug,
        });

      expect(response.headers["x-request-id"]).toBeDefined();
      expect(typeof response.headers["x-request-id"]).toBe("string");
    });

    it("returns 409 for duplicate slug", async () => {
      const uniqueSlug = `duplicate-test-${Date.now()}`;
      
      // Create first tenant
      await superAgent
        .post("/api/v1/super/tenants")
        .send({
          name: "First Tenant",
          slug: uniqueSlug,
        });

      // Try to create second tenant with same slug
      const response = await superAgent
        .post("/api/v1/super/tenants")
        .send({
          name: "Second Tenant",
          slug: uniqueSlug,
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("A tenant with this slug already exists");
    });

    it("returns 400 for validation errors with details", async () => {
      const response = await superAgent
        .post("/api/v1/super/tenants")
        .send({
          name: "",  // Empty name
          slug: "valid-slug",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation error");
      expect(response.body.details).toBeDefined();
    });

    it("returns 400 for invalid slug format", async () => {
      const response = await superAgent
        .post("/api/v1/super/tenants")
        .send({
          name: "Valid Name",
          slug: "INVALID SLUG!",  // Has spaces and uppercase
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation error");
    });
  });
});

describe("Request ID Middleware", () => {
  it("adds X-Request-Id header to response", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/test", (req, res) => {
      res.json({ requestId: req.requestId });
    });

    const response = await request(app).get("/test");

    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("uses existing X-Request-Id header if provided", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/test", (req, res) => {
      res.json({ requestId: req.requestId });
    });

    const customRequestId = "custom-id-12345";
    const response = await request(app)
      .get("/test")
      .set("X-Request-Id", customRequestId);

    expect(response.headers["x-request-id"]).toBe(customRequestId);
    expect(response.body.requestId).toBe(customRequestId);
  });
});
