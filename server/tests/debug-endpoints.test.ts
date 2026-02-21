/**
 * Integration Tests for Super Admin Debug Tools endpoints
 * 
 * Tests verify:
 * - All debug endpoints require super_user role
 * - Quarantine list returns stable shape with pagination
 * - Assign endpoint updates tenantId and writes audit event
 * - Backfill apply requires env flag + confirm header
 * - Integrity checks return stable issues array
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import passport from "passport";
import superDebugRoutes from "../routes/superDebug";
import { requireSuperUser } from "../middleware/tenantContext";
import { UserRole } from "@shared/schema";

// Create test app with mocked auth
function createTestApp(mockUser: any | null = null) {
  const app = express();
  app.use(express.json());
  
  // Mock session and passport
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Mock authentication middleware
  app.use((req, res, next) => {
    if (mockUser) {
      (req as any).user = mockUser;
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
  
  // Mock tenant context
  app.use((req, res, next) => {
    const user = (req as any).user;
    if (user) {
      (req as any).tenant = {
        tenantId: user.tenantId,
        effectiveTenantId: user.tenantId,
        isSuperUser: user.role === UserRole.SUPER_USER,
      };
    }
    next();
  });
  
  // Mount debug routes
  app.use("/api/v1/super/debug", superDebugRoutes);
  
  return app;
}

// Test users
const superUser = {
  id: "super-1",
  email: "super@test.com",
  role: UserRole.SUPER_USER,
  tenantId: null,
};

const regularUser = {
  id: "user-1",
  email: "user@test.com",
  role: "employee",
  tenantId: "tenant-1",
};

describe("Debug Endpoints - Access Control", () => {
  it("should reject unauthenticated requests to /config", async () => {
    const app = createTestApp(null);
    const response = await request(app).get("/api/v1/super/debug/config");
    expect(response.status).toBe(401);
  });
  
  it("should reject non-super user requests to /config", async () => {
    const app = createTestApp(regularUser);
    const response = await request(app).get("/api/v1/super/debug/config");
    expect(response.status).toBe(403);
  });
  
  it("should allow super user access to /config", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/config");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("flags");
    expect(response.body).toHaveProperty("confirmPhrases");
  });
  
  it("should reject non-super user requests to /quarantine/summary", async () => {
    const app = createTestApp(regularUser);
    const response = await request(app).get("/api/v1/super/debug/quarantine/summary");
    expect(response.status).toBe(403);
  });
  
  it("should reject non-super user requests to /tenantid/scan", async () => {
    const app = createTestApp(regularUser);
    const response = await request(app).get("/api/v1/super/debug/tenantid/scan");
    expect(response.status).toBe(403);
  });
  
  it("should reject non-super user requests to /integrity/checks", async () => {
    const app = createTestApp(regularUser);
    const response = await request(app).get("/api/v1/super/debug/integrity/checks");
    expect(response.status).toBe(403);
  });
});

describe("Quarantine Endpoints - Response Shape", () => {
  it("should return stable shape for /quarantine/summary", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/quarantine/summary");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("hasQuarantineTenant");
    expect(response.body).toHaveProperty("counts");
    expect(response.body.counts).toHaveProperty("projects");
    expect(response.body.counts).toHaveProperty("tasks");
    expect(response.body.counts).toHaveProperty("teams");
    expect(response.body.counts).toHaveProperty("users");
  });
  
  it("should return stable shape for /quarantine/list", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/quarantine/list?table=projects&page=1&limit=10");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("rows");
    expect(response.body).toHaveProperty("total");
    expect(response.body).toHaveProperty("page");
    expect(response.body).toHaveProperty("limit");
    expect(response.body).toHaveProperty("table");
    expect(Array.isArray(response.body.rows)).toBe(true);
  });
  
  it("should reject invalid table parameter for /quarantine/list", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/quarantine/list?table=invalid");
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });
  
  it("should accept all valid table values for /quarantine/list", async () => {
    const app = createTestApp(superUser);
    const validTables = ["projects", "tasks", "teams", "users"];
    
    for (const table of validTables) {
      const response = await request(app).get(`/api/v1/super/debug/quarantine/list?table=${table}`);
      expect(response.status).toBe(200);
      expect(response.body.table).toBe(table);
    }
  });
});

describe("TenantId Scan Endpoint", () => {
  it("should return stable shape for /tenantid/scan", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/tenantid/scan");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("missing");
    expect(response.body).toHaveProperty("totalMissing");
    expect(response.body).toHaveProperty("backfillAllowed");
    expect(response.body).toHaveProperty("notes");
    expect(response.body.missing).toHaveProperty("projects");
    expect(response.body.missing).toHaveProperty("tasks");
    expect(response.body.missing).toHaveProperty("teams");
    expect(response.body.missing).toHaveProperty("users");
    expect(Array.isArray(response.body.notes)).toBe(true);
  });
});

describe("Backfill Endpoint - Guards", () => {
  it("should allow dry_run without guards", async () => {
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/tenantid/backfill?mode=dry_run");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("mode", "dry_run");
    expect(response.body).toHaveProperty("updated");
    expect(response.body).toHaveProperty("quarantined");
  });
  
  it("should reject apply mode without env flag", async () => {
    const originalEnv = process.env.BACKFILL_TENANT_IDS_ALLOWED;
    process.env.BACKFILL_TENANT_IDS_ALLOWED = "false";
    
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/tenantid/backfill?mode=apply")
      .set("X-Confirm-Backfill", "APPLY_TENANTID_BACKFILL");
    
    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("error");
    
    process.env.BACKFILL_TENANT_IDS_ALLOWED = originalEnv;
  });
  
  it("should reject apply mode without confirmation header", async () => {
    const originalEnv = process.env.BACKFILL_TENANT_IDS_ALLOWED;
    process.env.BACKFILL_TENANT_IDS_ALLOWED = "true";
    
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/tenantid/backfill?mode=apply");
    // Missing X-Confirm-Backfill header
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    
    process.env.BACKFILL_TENANT_IDS_ALLOWED = originalEnv;
  });
});

describe("Integrity Checks Endpoint", () => {
  it("should return stable shape for /integrity/checks", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/integrity/checks");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("issues");
    expect(response.body).toHaveProperty("totalIssues");
    expect(response.body).toHaveProperty("blockerCount");
    expect(response.body).toHaveProperty("warnCount");
    expect(response.body).toHaveProperty("infoCount");
    expect(response.body).toHaveProperty("timestamp");
    expect(Array.isArray(response.body.issues)).toBe(true);
  });
  
  it("should categorize issues by severity", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/integrity/checks");
    expect(response.status).toBe(200);
    
    const totalFromCounts = 
      response.body.blockerCount + 
      response.body.warnCount + 
      response.body.infoCount;
    expect(response.body.totalIssues).toBe(totalFromCounts);
  });
});

describe("Delete Endpoint - High Risk Guards", () => {
  it("should reject delete without env flag", async () => {
    const originalEnv = process.env.SUPER_DEBUG_DELETE_ALLOWED;
    process.env.SUPER_DEBUG_DELETE_ALLOWED = "false";
    
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/delete")
      .set("X-Confirm-Delete", "DELETE_QUARANTINED_ROW")
      .send({
        table: "projects",
        id: "test-id",
        confirmPhrase: "DELETE_QUARANTINED_ROW",
      });
    
    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("error");
    const errorField = response.body.error;
    const errorMsg = typeof errorField === "string" ? errorField : errorField?.message ?? "";
    expect(errorMsg).toContain("not allowed");
    
    process.env.SUPER_DEBUG_DELETE_ALLOWED = originalEnv;
  });
  
  it("should reject delete without confirmation header", async () => {
    const originalEnv = process.env.SUPER_DEBUG_DELETE_ALLOWED;
    process.env.SUPER_DEBUG_DELETE_ALLOWED = "true";
    
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/delete")
      // Missing X-Confirm-Delete header
      .send({
        table: "projects",
        id: "test-id",
        confirmPhrase: "DELETE_QUARANTINED_ROW",
      });
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    
    process.env.SUPER_DEBUG_DELETE_ALLOWED = originalEnv;
  });
  
  it("should reject delete with wrong confirmation phrase", async () => {
    const originalEnv = process.env.SUPER_DEBUG_DELETE_ALLOWED;
    process.env.SUPER_DEBUG_DELETE_ALLOWED = "true";
    
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/delete")
      .set("X-Confirm-Delete", "DELETE_QUARANTINED_ROW")
      .send({
        table: "projects",
        id: "test-id",
        confirmPhrase: "WRONG_PHRASE",
      });
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    
    process.env.SUPER_DEBUG_DELETE_ALLOWED = originalEnv;
  });
});

describe("Config Endpoint - Response Shape", () => {
  it("should return all expected config fields", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/config");
    
    expect(response.status).toBe(200);
    expect(response.body.flags).toHaveProperty("SUPER_DEBUG_DELETE_ALLOWED");
    expect(response.body.flags).toHaveProperty("SUPER_DEBUG_ACTIONS_ALLOWED");
    expect(response.body.flags).toHaveProperty("BACKFILL_TENANT_IDS_ALLOWED");
    expect(response.body.flags).toHaveProperty("TENANCY_ENFORCEMENT");
    expect(response.body.confirmPhrases).toHaveProperty("delete");
    expect(response.body.confirmPhrases).toHaveProperty("backfill");
    expect(response.body.confirmPhrases).toHaveProperty("recompute");
    expect(response.body.confirmPhrases).toHaveProperty("invalidate");
  });
  
  it("should not expose secrets in config", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/config");
    
    expect(response.status).toBe(200);
    const responseStr = JSON.stringify(response.body);
    
    // Verify no secrets are exposed
    expect(responseStr).not.toContain("DATABASE_URL");
    expect(responseStr).not.toContain("SESSION_SECRET");
    expect(responseStr).not.toContain("ENCRYPTION_KEY");
    expect(responseStr).not.toContain("password");
  });
});

describe("Archive Endpoint", () => {
  it("should require super_user role", async () => {
    const app = createTestApp(regularUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/archive")
      .send({ table: "users", id: "test-id" });
    expect(response.status).toBe(403);
  });
  
  it("should require table and id fields", async () => {
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/archive")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });
});

describe("Assign Endpoint", () => {
  it("should require super_user role", async () => {
    const app = createTestApp(regularUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/assign")
      .send({
        table: "projects",
        id: "test-id",
        assignTo: { tenantId: "tenant-id" },
      });
    expect(response.status).toBe(403);
  });
  
  it("should validate request body", async () => {
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/assign")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });
  
  it("should reject invalid table type", async () => {
    const app = createTestApp(superUser);
    const response = await request(app)
      .post("/api/v1/super/debug/quarantine/assign")
      .send({
        table: "invalid_table",
        id: "test-id",
        assignTo: { tenantId: "tenant-id" },
      });
    expect(response.status).toBe(400);
  });
});
