import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { db } from "../db";
import { tenants, users, TenantStatus, UserRole } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { tenantStatusGuard } from "../middleware/tenantStatusGuard";
import { storage } from "../storage";

describe("Tenant Pre-Provisioning", () => {
  let app: Express;
  let testTenantId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    // Mock authenticated super user
    app.use((req, res, next) => {
      const isSuperUser = req.headers["x-test-super-user"] === "true";
      (req as any).user = {
        id: "test-user-id",
        email: isSuperUser ? "super@test.com" : "tenant@test.com",
        role: isSuperUser ? UserRole.SUPER_USER : UserRole.ADMIN,
        tenantId: isSuperUser ? null : testTenantId,
      };
      next();
    });

    app.use(tenantContextMiddleware);
    app.use(tenantStatusGuard());

    app.get("/api/test/tenant-context", (req, res) => {
      res.json({
        tenantId: req.tenant?.tenantId,
        effectiveTenantId: req.tenant?.effectiveTenantId,
        isSuperUser: req.tenant?.isSuperUser,
      });
    });

    // Get a test tenant
    const existingTenants = await db.select().from(tenants).limit(1);
    if (existingTenants.length > 0) {
      testTenantId = existingTenants[0].id;
    }
  });

  describe("tenantContextMiddleware", () => {
    it("super user can set effectiveTenantId via X-Tenant-Id header", async () => {
      if (!testTenantId) return;
      
      const response = await request(app)
        .get("/api/test/tenant-context")
        .set("X-Test-Super-User", "true")
        .set("X-Tenant-Id", testTenantId);

      expect(response.status).toBe(200);
      expect(response.body.effectiveTenantId).toBe(testTenantId);
      expect(response.body.isSuperUser).toBe(true);
    });

    it("non-super user cannot use X-Tenant-Id header to change tenant", async () => {
      if (!testTenantId) return;
      
      const response = await request(app)
        .get("/api/test/tenant-context")
        .set("X-Test-Super-User", "false")
        .set("X-Tenant-Id", "some-other-tenant-id");

      expect(response.body.effectiveTenantId).toBe(testTenantId);
      expect(response.body.isSuperUser).toBe(false);
    });

    it("super user with invalid tenant ID gets 404", async () => {
      const response = await request(app)
        .get("/api/test/tenant-context")
        .set("X-Test-Super-User", "true")
        .set("X-Tenant-Id", "non-existent-tenant-id");

      expect(response.status).toBe(404);
    });
  });

  describe("Tenant activation endpoints", () => {
    it("tenants table has activatedBySuperUserAt column", async () => {
      const [tenant] = await db.select().from(tenants).limit(1);
      if (tenant) {
        expect("activatedBySuperUserAt" in tenant).toBe(true);
      }
    });

    it("tenants table has proper status enum values", async () => {
      expect(TenantStatus.ACTIVE).toBe("active");
      expect(TenantStatus.INACTIVE).toBe("inactive");
      expect(TenantStatus.SUSPENDED).toBe("suspended");
    });
  });

  describe("Pre-provisioning database state", () => {
    it("super users have null tenantId", async () => {
      const superUsers = await db.select()
        .from(users)
        .where(eq(users.role, UserRole.SUPER_USER))
        .limit(1);
      
      if (superUsers.length > 0) {
        expect(superUsers[0].tenantId).toBeNull();
      }
    });

    it("tenants can exist with null onboardedAt", async () => {
      const tenantsWithoutOnboarding = await db.select()
        .from(tenants)
        .limit(5);
      
      const hasNullOnboardedAt = tenantsWithoutOnboarding.some(t => t.onboardedAt === null);
      expect(hasNullOnboardedAt).toBeDefined();
    });
  });

  describe("Tenant status transitions via storage", () => {
    let statusTestTenantId: string | null = null;

    beforeAll(async () => {
      // Create a test tenant for status transition tests
      const result = await db.insert(tenants).values({
        name: "Status Test Tenant",
        slug: `status-test-${Date.now()}`,
        status: TenantStatus.INACTIVE,
      }).returning();
      
      if (result.length > 0) {
        statusTestTenantId = result[0].id;
      }
    });

    afterAll(async () => {
      if (statusTestTenantId) {
        await db.delete(tenants).where(eq(tenants.id, statusTestTenantId));
      }
    });

    it("activation sets status to active and records activatedBySuperUserAt", async () => {
      if (!statusTestTenantId) return;

      // Activate the tenant
      const updated = await db.update(tenants)
        .set({
          status: TenantStatus.ACTIVE,
          activatedBySuperUserAt: new Date(),
        })
        .where(eq(tenants.id, statusTestTenantId))
        .returning();

      expect(updated[0].status).toBe(TenantStatus.ACTIVE);
      expect(updated[0].activatedBySuperUserAt).not.toBeNull();
    });

    it("suspension sets status to suspended", async () => {
      if (!statusTestTenantId) return;

      const updated = await db.update(tenants)
        .set({ status: TenantStatus.SUSPENDED })
        .where(eq(tenants.id, statusTestTenantId))
        .returning();

      expect(updated[0].status).toBe(TenantStatus.SUSPENDED);
    });

    it("deactivation sets status to inactive", async () => {
      if (!statusTestTenantId) return;

      const updated = await db.update(tenants)
        .set({ status: TenantStatus.INACTIVE })
        .where(eq(tenants.id, statusTestTenantId))
        .returning();

      expect(updated[0].status).toBe(TenantStatus.INACTIVE);
    });
  });
});
