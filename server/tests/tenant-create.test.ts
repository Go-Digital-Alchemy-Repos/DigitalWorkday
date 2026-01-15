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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import session from "express-session";
import passport from "passport";
import { db } from "../db";
import { 
  users, tenants, workspaces, tenantSettings, tenantAuditEvents,
  UserRole 
} from "../../shared/schema";
import { sql, eq, like } from "drizzle-orm";
import { requestIdMiddleware } from "../middleware/requestId";
import { hashPassword } from "../auth";
import superAdminRoutes from "../routes/superAdmin";
import crypto from "crypto";

const TEST_EMAIL_PREFIX = "test-tenant-create-";

function createTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  
  app.use(passport.initialize());
  app.use(passport.session());
  
  return app;
}

async function clearTestData() {
  await db.delete(tenantAuditEvents).where(sql`1=1`);
  await db.delete(tenantSettings).where(sql`tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'test-create-%')`);
  await db.delete(workspaces).where(sql`tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'test-create-%')`);
  await db.delete(tenants).where(like(tenants.slug, "test-create-%"));
  await db.delete(users).where(like(users.email, `${TEST_EMAIL_PREFIX}%`));
}

async function createSuperUser(email?: string) {
  const passwordHash = await hashPassword("superpass123");
  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(),
    email: email || `${TEST_EMAIL_PREFIX}super-${Date.now()}@example.com`,
    name: "Test Super User",
    firstName: "Test",
    lastName: "Super",
    role: UserRole.SUPER_USER,
    isActive: true,
    passwordHash,
    tenantId: null,
  }).returning();
  return user;
}

function createAuthenticatedApp(user: any) {
  const app = createTestApp();
  
  app.use((req, res, next) => {
    (req as any).user = user;
    (req as any).isAuthenticated = () => true;
    next();
  });
  
  app.use("/api/v1/super", superAdminRoutes);
  
  return app;
}

describe("Tenant Creation", () => {
  let superUser: any;

  beforeEach(async () => {
    await clearTestData();
    superUser = await createSuperUser();
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe("POST /api/v1/super/tenants", () => {
    it("creates tenant successfully with primary workspace", async () => {
      const app = createAuthenticatedApp(superUser);
      const uniqueSlug = `test-create-${Date.now()}`;
      
      const response = await request(app)
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
      const app = createAuthenticatedApp(superUser);
      const uniqueSlug = `test-create-super-${Date.now()}`;
      
      const response = await request(app)
        .post("/api/v1/super/tenants")
        .send({
          name: "Super Created Tenant",
          slug: uniqueSlug,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
    });

    it("includes X-Request-Id header in success response", async () => {
      const app = createAuthenticatedApp(superUser);
      const uniqueSlug = `test-create-rid-${Date.now()}`;
      
      const response = await request(app)
        .post("/api/v1/super/tenants")
        .send({
          name: "Request ID Test",
          slug: uniqueSlug,
        });

      expect(response.headers["x-request-id"]).toBeDefined();
      expect(typeof response.headers["x-request-id"]).toBe("string");
    });

    it("includes X-Request-Id header in error response", async () => {
      const app = createAuthenticatedApp(superUser);
      
      const response = await request(app)
        .post("/api/v1/super/tenants")
        .send({
          name: "",  // Invalid - empty name
          slug: "test-create-invalid",
        });

      expect(response.status).toBe(400);
      expect(response.headers["x-request-id"]).toBeDefined();
      expect(typeof response.headers["x-request-id"]).toBe("string");
    });

    it("returns 409 for duplicate slug", async () => {
      const app = createAuthenticatedApp(superUser);
      const uniqueSlug = `test-create-dup-${Date.now()}`;
      
      await request(app)
        .post("/api/v1/super/tenants")
        .send({
          name: "First Tenant",
          slug: uniqueSlug,
        });

      const response = await request(app)
        .post("/api/v1/super/tenants")
        .send({
          name: "Second Tenant",
          slug: uniqueSlug,
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("A tenant with this slug already exists");
    });

    it("returns 400 for validation errors with details", async () => {
      const app = createAuthenticatedApp(superUser);
      
      const response = await request(app)
        .post("/api/v1/super/tenants")
        .send({
          name: "",
          slug: "valid-slug",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation error");
      expect(response.body.details).toBeDefined();
    });

    it("returns 400 for invalid slug format", async () => {
      const app = createAuthenticatedApp(superUser);
      
      const response = await request(app)
        .post("/api/v1/super/tenants")
        .send({
          name: "Valid Name",
          slug: "INVALID SLUG!",
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
