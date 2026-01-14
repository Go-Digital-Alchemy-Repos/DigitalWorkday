import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { db } from "../db";
import { users, tenants, workspaces, workspaceMembers, UserRole } from "../../shared/schema";
import { sql, eq } from "drizzle-orm";
import { hashPassword } from "../auth";
import { safeDeleteAllUsers } from "./fixtures";

// Store original env values
const originalEnv = { ...process.env };

// Track created user IDs for cleanup
let createdUserIds: string[] = [];

describe("Purge Endpoint Guards", () => {
  let app: ReturnType<typeof express>;
  let superUserCookie: string;

  beforeEach(async () => {
    // Reset env to original
    process.env = { ...originalEnv };
    createdUserIds = [];
    
    // Clean users table safely (handles FK constraints)
    await safeDeleteAllUsers();
    
    // Create a super user for testing
    const passwordHash = await hashPassword("testpassword123");
    const [superUser] = await db.insert(users).values({
      email: "superadmin@test.com",
      name: "Super Admin",
      passwordHash,
      role: UserRole.SUPER_USER,
      isActive: true,
    }).returning();
    createdUserIds.push(superUser.id);

    // Create app with routes
    app = express();
    app.use(express.json());
    
    const { setupAuth } = await import("../auth");
    setupAuth(app as any);
    
    const superAdminRoutes = (await import("../routes/superAdmin")).default;
    app.use("/api/v1/super", superAdminRoutes);

    // Login to get session cookie
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "superadmin@test.com", password: "testpassword123" });
    
    superUserCookie = loginRes.headers["set-cookie"]?.[0] || "";
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await safeDeleteAllUsers();
  });

  it("should reject purge without PURGE_APP_DATA_ALLOWED", async () => {
    delete process.env.PURGE_APP_DATA_ALLOWED;
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie)
      .set("X-Confirm-Purge", "YES_PURGE_APP_DATA");

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("not allowed");
  });

  it("should reject purge without X-Confirm-Purge header", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("confirmation");
  });

  it("should reject purge with wrong confirmation phrase", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie)
      .set("X-Confirm-Purge", "wrong_phrase");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("confirmation");
  });

  it("should reject purge in production without PURGE_PROD_ALLOWED", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    process.env.NODE_ENV = "production";
    delete process.env.PURGE_PROD_ALLOWED;
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie)
      .set("X-Confirm-Purge", "YES_PURGE_APP_DATA");

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("production");
  });

  it("should reject purge from non-super-user", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    
    // Create a tenant for the regular user
    const [tenant] = await db.insert(tenants).values({
      name: "Regular User Tenant",
      slug: `regular-tenant-${Date.now()}`,
      status: "active",
    }).returning();
    
    // Create a regular user with tenant
    const passwordHash = await hashPassword("regularpassword");
    const [regularUser] = await db.insert(users).values({
      email: "regular@test.com",
      name: "Regular User",
      passwordHash,
      role: UserRole.EMPLOYEE,
      tenantId: tenant.id,
      isActive: true,
    }).returning();
    createdUserIds.push(regularUser.id);
    
    // Create workspace for the regular user
    const [workspace] = await db.insert(workspaces).values({
      name: "Regular User Workspace",
      tenantId: tenant.id,
      isPrimary: true,
      createdBy: regularUser.id,
    }).returning();
    
    // Add user to workspace
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: regularUser.id,
      role: "member",
    });

    // Login as regular user
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "regular@test.com", password: "regularpassword" });
    
    const regularUserCookie = loginRes.headers["set-cookie"]?.[0] || "";

    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", regularUserCookie)
      .set("X-Confirm-Purge", "YES_PURGE_APP_DATA");

    expect(response.status).toBe(403);
  });
});

describe("Purge Script Guards", () => {
  it("should have correct environment variable requirements documented", () => {
    // This test verifies the script exists and has proper guards
    // The actual script testing is done via integration tests
    const fs = require("fs");
    const scriptPath = "server/scripts/purge_app_data.ts";
    
    expect(fs.existsSync(scriptPath)).toBe(true);
    
    const content = fs.readFileSync(scriptPath, "utf-8");
    
    // Verify safety guards are documented
    expect(content).toContain("PURGE_APP_DATA_ALLOWED");
    expect(content).toContain("PURGE_APP_DATA_CONFIRM");
    expect(content).toContain("PURGE_PROD_ALLOWED");
    expect(content).toContain("YES_PURGE_APP_DATA");
  });
});
