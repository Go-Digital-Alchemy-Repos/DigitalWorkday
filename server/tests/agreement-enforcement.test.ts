/**
 * Agreement Enforcement Middleware Tests
 * 
 * Tests edge cases and security invariants of the agreement enforcement system.
 * See server/middleware/agreementEnforcement.ts for invariant documentation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import { db } from "../db";
import { 
  users, 
  tenants, 
  tenantAgreements, 
  tenantAgreementAcceptances,
  workspaces,
  workspaceMembers,
  UserRole, 
  AgreementStatus 
} from "../../shared/schema";
import { sql, eq, and, isNull } from "drizzle-orm";
import { hashPassword, setupAuth } from "../auth";
import { 
  agreementEnforcementGuard, 
  invalidateAgreementCache, 
  clearAgreementCache 
} from "../middleware/agreementEnforcement";

// Test fixture data
let testTenantId: string;
let testUserId: string;
let testWorkspaceId: string;
let testAgreementId: string;
let app: Express;
let userCookie: string;

let stashedGlobalAgreements: { id: string; originalStatus: string }[] = [];

async function suspendGlobalAgreements() {
  const globals = await db.select({ id: tenantAgreements.id, status: tenantAgreements.status })
    .from(tenantAgreements)
    .where(and(isNull(tenantAgreements.tenantId), eq(tenantAgreements.status, AgreementStatus.ACTIVE)));
  stashedGlobalAgreements = globals.map(g => ({ id: g.id, originalStatus: g.status }));
  for (const g of stashedGlobalAgreements) {
    await db.update(tenantAgreements)
      .set({ status: AgreementStatus.DRAFT })
      .where(eq(tenantAgreements.id, g.id));
  }
}

async function restoreGlobalAgreements() {
  for (const g of stashedGlobalAgreements) {
    await db.update(tenantAgreements)
      .set({ status: g.originalStatus })
      .where(eq(tenantAgreements.id, g.id));
  }
  stashedGlobalAgreements = [];
}

async function cleanupTestData() {
  await db.execute(sql`DELETE FROM tenant_agreement_acceptances WHERE tenant_id = ${testTenantId}`);
  await db.execute(sql`DELETE FROM tenant_agreements WHERE tenant_id = ${testTenantId}`);
  await db.execute(sql`DELETE FROM workspace_members WHERE workspace_id = ${testWorkspaceId}`);
  await db.execute(sql`DELETE FROM workspaces WHERE tenant_id = ${testTenantId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${testUserId}`);
  await db.execute(sql`DELETE FROM tenants WHERE id = ${testTenantId}`);
}

async function createTestFixtures(options: {
  createAgreement?: boolean;
  agreementStatus?: typeof AgreementStatus[keyof typeof AgreementStatus];
  createAcceptance?: boolean;
  userRole?: string;
} = {}) {
  const { 
    createAgreement = true, 
    agreementStatus = AgreementStatus.ACTIVE,
    createAcceptance = false,
    userRole = UserRole.ADMIN
  } = options;

  // Create tenant
  const [tenant] = await db.insert(tenants).values({
    name: "Agreement Test Tenant",
    slug: `agreement-test-${Date.now()}`,
    status: "active",
  }).returning();
  testTenantId = tenant.id;

  // Create user
  const passwordHash = await hashPassword("testpassword123");
  const [user] = await db.insert(users).values({
    email: `agreement-test-${Date.now()}@test.com`,
    name: "Agreement Test User",
    passwordHash,
    role: userRole,
    tenantId: testTenantId,
    isActive: true,
  }).returning();
  testUserId = user.id;

  // Create workspace
  const [workspace] = await db.insert(workspaces).values({
    name: "Agreement Test Workspace",
    tenantId: testTenantId,
    isPrimary: true,
    createdBy: testUserId,
  }).returning();
  testWorkspaceId = workspace.id;

  // Add user to workspace
  await db.insert(workspaceMembers).values({
    workspaceId: testWorkspaceId,
    userId: testUserId,
    role: "owner",
  });

  // Create agreement if requested
  if (createAgreement) {
    const [agreement] = await db.insert(tenantAgreements).values({
      tenantId: testTenantId,
      title: "Test Agreement",
      body: "Test agreement content",
      version: 1,
      status: agreementStatus,
      createdByUserId: testUserId,
    }).returning();
    testAgreementId = agreement.id;

    // Create acceptance if requested
    if (createAcceptance && agreementStatus === AgreementStatus.ACTIVE) {
      await db.insert(tenantAgreementAcceptances).values({
        tenantId: testTenantId,
        userId: testUserId,
        agreementId: testAgreementId,
        version: 1,
      });
    }
  }

  return { tenantId: testTenantId, userId: testUserId, email: user.email };
}

async function setupTestApp() {
  app = express();
  app.use(express.json());
  
  setupAuth(app);
  
  // Apply agreement enforcement to a test route
  app.get("/api/v1/protected", agreementEnforcementGuard, (req, res) => {
    res.json({ success: true, message: "Protected route accessed" });
  });

  // Exempt route (matches /api/auth/*)
  app.get("/api/auth/status", (req, res) => {
    res.json({ success: true, message: "Auth status route" });
  });

  // Agreement status route (exempt)
  app.get("/api/v1/me/agreement/status", agreementEnforcementGuard, (req, res) => {
    res.json({ success: true, message: "Agreement status route" });
  });

  return app;
}

async function loginUser(app: Express, email: string, password: string): Promise<string> {
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  return loginRes.headers["set-cookie"]?.[0] || "";
}

describe("Agreement Enforcement Middleware", () => {
  beforeEach(async () => {
    clearAgreementCache();
    await suspendGlobalAgreements();
    clearAgreementCache();
  });

  afterEach(async () => {
    if (testTenantId) {
      try {
        await cleanupTestData();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    await restoreGlobalAgreements();
    clearAgreementCache();
  });

  describe("Tenant with No Agreements", () => {
    it("should allow access when tenant has no agreements", async () => {
      const { email } = await createTestFixtures({ createAgreement: false });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("Tenant with Draft Agreement Only", () => {
    it("should allow access when tenant has only draft agreements", async () => {
      const { email } = await createTestFixtures({ 
        createAgreement: true, 
        agreementStatus: AgreementStatus.DRAFT 
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("Tenant with Active Agreement - Not Accepted", () => {
    it("should block access with 451 when user hasn't accepted active agreement", async () => {
      const { email } = await createTestFixtures({ 
        createAgreement: true, 
        agreementStatus: AgreementStatus.ACTIVE,
        createAcceptance: false
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);

      expect(response.status).toBe(451);
      expect(response.body.code).toBe("AGREEMENT_REQUIRED");
      expect(response.body.redirectTo).toBe("/accept-terms");
    });
  });

  describe("Tenant with Active Agreement - Accepted", () => {
    it("should allow access when user has accepted active agreement", async () => {
      const { email } = await createTestFixtures({ 
        createAgreement: true, 
        agreementStatus: AgreementStatus.ACTIVE,
        createAcceptance: true
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("Exempt Routes", () => {
    it("should not block exempt routes regardless of agreement status", async () => {
      const { email } = await createTestFixtures({ 
        createAgreement: true, 
        agreementStatus: AgreementStatus.ACTIVE,
        createAcceptance: false
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      // Agreement status route is exempt
      const response = await request(app)
        .get("/api/v1/me/agreement/status")
        .set("Cookie", userCookie);

      expect(response.status).toBe(200);
    });

    it("should exempt auth routes", async () => {
      app = await setupTestApp();
      
      // Auth routes should be accessible without any auth
      const response = await request(app)
        .get("/api/auth/status");

      expect(response.status).toBe(200);
    });
  });

  describe("Super User Bypass", () => {
    it("should allow super_user access without agreement", async () => {
      // Create super user (no tenant)
      const passwordHash = await hashPassword("superpass123");
      const [superUser] = await db.insert(users).values({
        email: `super-${Date.now()}@test.com`,
        name: "Super Admin",
        passwordHash,
        role: UserRole.SUPER_USER,
        tenantId: null,
        isActive: true,
      }).returning();

      app = await setupTestApp();
      const superCookie = await loginUser(app, superUser.email, "superpass123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", superCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Cleanup
      await db.delete(users).where(eq(users.id, superUser.id));
    });

    it("should allow super_user impersonating tenant with required agreement", async () => {
      // Create tenant with active agreement
      await createTestFixtures({ 
        createAgreement: true, 
        agreementStatus: AgreementStatus.ACTIVE,
        createAcceptance: false
      });

      // Create super user
      const passwordHash = await hashPassword("superpass123");
      const [superUser] = await db.insert(users).values({
        email: `super-impersonate-${Date.now()}@test.com`,
        name: "Super Admin Impersonator",
        passwordHash,
        role: UserRole.SUPER_USER,
        tenantId: null,
        isActive: true,
      }).returning();

      app = await setupTestApp();
      const superCookie = await loginUser(app, superUser.email, "superpass123");

      // Super user accessing protected route - should be allowed
      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", superCookie)
        .set("X-Tenant-Id", testTenantId); // Impersonating tenant

      expect(response.status).toBe(200);

      // Cleanup
      await db.delete(users).where(eq(users.id, superUser.id));
    });
  });

  describe("No Active Agreement After Deletion", () => {
    it("should allow access when active agreement is deleted (INVARIANT 3)", async () => {
      const { email } = await createTestFixtures({ 
        createAgreement: true, 
        agreementStatus: AgreementStatus.ACTIVE 
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      invalidateAgreementCache(testTenantId);
      await db.delete(tenantAgreements).where(eq(tenantAgreements.id, testAgreementId));
      
      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);

      expect(response.status).toBe(200);
    });
  });

  describe("Unauthenticated Users", () => {
    it("should pass through unauthenticated requests", async () => {
      app = await setupTestApp();

      // No cookie - unauthenticated
      const response = await request(app)
        .get("/api/v1/protected");

      // The route itself may require auth and return 401
      // But the agreement middleware should pass through
      // (actual auth enforcement is separate)
      expect([200, 401]).toContain(response.status);
    });
  });

  describe("Users Without Tenant (Orphaned Users)", () => {
    it("should block non-super users without tenantId (orphaned)", async () => {
      // Create user without tenant (orphaned state)
      const passwordHash = await hashPassword("notenantpass123");
      const [noTenantUser] = await db.insert(users).values({
        email: `no-tenant-${Date.now()}@test.com`,
        name: "No Tenant User",
        passwordHash,
        role: UserRole.EMPLOYEE,
        tenantId: null,
        isActive: true,
      }).returning();

      // Create test app with middleware that injects an authenticated orphaned user
      const testApp = express();
      testApp.use(express.json());
      
      // Mock authentication middleware that simulates orphaned user being authenticated
      testApp.use((req, res, next) => {
        (req as any).isAuthenticated = () => true;
        (req as any).user = {
          id: noTenantUser.id,
          role: UserRole.EMPLOYEE,
          tenantId: null, // Orphaned user
        };
        next();
      });
      
      testApp.get("/api/v1/protected", agreementEnforcementGuard, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(testApp)
        .get("/api/v1/protected");

      expect(response.status).toBe(451);
      expect(response.body.code).toBe("TENANT_REQUIRED");
      expect(response.body.message).toContain("not properly configured");

      // Cleanup
      await db.delete(users).where(eq(users.id, noTenantUser.id));
    });

    it("should allow super_user without tenantId (platform admin)", async () => {
      // Create super user (no tenant)
      const passwordHash = await hashPassword("superpass123");
      const [superUser] = await db.insert(users).values({
        email: `super-no-tenant-${Date.now()}@test.com`,
        name: "Super Admin",
        passwordHash,
        role: UserRole.SUPER_USER,
        tenantId: null,
        isActive: true,
      }).returning();

      app = await setupTestApp();
      const superCookie = await loginUser(app, superUser.email, "superpass123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", superCookie);

      // Super users bypass enforcement even without tenant
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Cleanup
      await db.delete(users).where(eq(users.id, superUser.id));
    });
  });

  describe("Archived Agreement", () => {
    it("should allow access when tenant has only archived agreements", async () => {
      const { email } = await createTestFixtures({ 
        createAgreement: true, 
        agreementStatus: AgreementStatus.ARCHIVED 
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("Agreement Gating Round-Trip", () => {
    it("should return 451 when active agreement exists but user has not accepted", async () => {
      const { email } = await createTestFixtures({
        createAgreement: true,
        agreementStatus: AgreementStatus.ACTIVE,
        createAcceptance: false,
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      const response = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);

      expect(response.status).toBe(451);
      expect(response.body.code).toBe("AGREEMENT_REQUIRED");
      expect(response.body.redirectTo).toBe("/accept-terms");
    });

    it("should return 200 after user accepts the active agreement", async () => {
      const { email } = await createTestFixtures({
        createAgreement: true,
        agreementStatus: AgreementStatus.ACTIVE,
        createAcceptance: false,
      });
      app = await setupTestApp();
      userCookie = await loginUser(app, email, "testpassword123");

      const blocked = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);
      expect(blocked.status).toBe(451);

      await db.insert(tenantAgreementAcceptances).values({
        tenantId: testTenantId,
        userId: testUserId,
        agreementId: testAgreementId,
        version: 1,
      });
      clearAgreementCache();

      const allowed = await request(app)
        .get("/api/v1/protected")
        .set("Cookie", userCookie);
      expect(allowed.status).toBe(200);
      expect(allowed.body.success).toBe(true);
    });
  });
});
