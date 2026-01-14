/**
 * Platform Admins API Integration Tests
 * 
 * Tests for platform admin management and invite endpoints.
 * Uses the actual application routes and database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import { db } from "../db";
import { users, platformInvitations, platformAuditEvents, UserRole } from "../../shared/schema";
import { sql, eq, and } from "drizzle-orm";
import { requestIdMiddleware } from "../middleware/requestId";
import { setupPlatformInviteEndpoints, hashPassword } from "../auth";
import superAdminRoutes from "../routes/superAdmin";
import session from "express-session";
import crypto from "crypto";

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
  
  setupPlatformInviteEndpoints(app);
  return app;
}

async function clearTestData() {
  await db.delete(platformInvitations).where(sql`email LIKE 'test-platform-%'`);
  await db.delete(users).where(sql`email LIKE 'test-platform-%'`);
}

async function createTestUser(email: string = "test-platform-admin@example.com") {
  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    name: "Test Platform Admin",
    firstName: "Test",
    lastName: "Admin",
    role: UserRole.SUPER_USER,
    isActive: true,
    passwordHash: null,
  }).returning();
  return user;
}

async function createTestInvite(
  userId: string, 
  email: string,
  status: "pending" | "accepted" | "expired" | "revoked" = "pending",
  expiresInDays: number = 7
) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  
  const [invite] = await db.insert(platformInvitations).values({
    id: crypto.randomUUID(),
    email,
    tokenHash,
    status,
    expiresAt,
    targetUserId: userId,
    createdByUserId: userId,
  }).returning();
  
  return { invite, token };
}

describe("Platform Invite Verify Endpoint", () => {
  beforeEach(async () => {
    await clearTestData();
  });

  afterEach(async () => {
    await clearTestData();
  });

  it("should return 400 when token is missing", async () => {
    const app = createTestApp();
    
    const res = await request(app).get("/api/v1/auth/platform-invite/verify");
    
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toBe("Token is required");
  });

  it("should return 404 for invalid token", async () => {
    const app = createTestApp();
    
    const res = await request(app)
      .get("/api/v1/auth/platform-invite/verify")
      .query({ token: "invalid-token-that-does-not-exist" });
    
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_INVALID");
  });

  it("should return invite info for valid pending token", async () => {
    const app = createTestApp();
    const user = await createTestUser("test-platform-valid@example.com");
    const { token } = await createTestInvite(user.id, user.email);
    
    const res = await request(app)
      .get("/api/v1/auth/platform-invite/verify")
      .query({ token });
    
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.email).toBe(user.email);
    expect(res.body.role).toBe("super_user");
    expect(res.body.targetUser).toBeDefined();
    expect(res.body.targetUser.email).toBe(user.email);
  });

  it("should return 410 for already used token", async () => {
    const app = createTestApp();
    const user = await createTestUser("test-platform-used@example.com");
    const { token } = await createTestInvite(user.id, user.email, "accepted");
    
    const res = await request(app)
      .get("/api/v1/auth/platform-invite/verify")
      .query({ token });
    
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("TOKEN_ALREADY_USED");
  });

  it("should return 410 for revoked token", async () => {
    const app = createTestApp();
    const user = await createTestUser("test-platform-revoked@example.com");
    const { token } = await createTestInvite(user.id, user.email, "revoked");
    
    const res = await request(app)
      .get("/api/v1/auth/platform-invite/verify")
      .query({ token });
    
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("TOKEN_REVOKED");
  });

  it("should return 410 for expired token", async () => {
    const app = createTestApp();
    const user = await createTestUser("test-platform-expired@example.com");
    const { token } = await createTestInvite(user.id, user.email, "pending", -1); // Expired 1 day ago
    
    const res = await request(app)
      .get("/api/v1/auth/platform-invite/verify")
      .query({ token });
    
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });
});

describe("Platform Invite Accept Endpoint", () => {
  beforeEach(async () => {
    await clearTestData();
  });

  afterEach(async () => {
    await clearTestData();
  });

  it("should return 400 when token or password is missing", async () => {
    const app = createTestApp();
    
    const res = await request(app)
      .post("/api/v1/auth/platform-invite/accept")
      .send({});
    
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toBe("Token and password are required");
  });

  it("should return 400 for short password", async () => {
    const app = createTestApp();
    
    const res = await request(app)
      .post("/api/v1/auth/platform-invite/accept")
      .send({ token: "some-token", password: "short" });
    
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toBe("Password must be at least 8 characters");
  });

  it("should return 404 for invalid token", async () => {
    const app = createTestApp();
    
    const res = await request(app)
      .post("/api/v1/auth/platform-invite/accept")
      .send({ token: "invalid-token", password: "securepassword123" });
    
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TOKEN_INVALID");
  });

  it("should accept valid invite and set password", async () => {
    const app = createTestApp();
    const user = await createTestUser("test-platform-accept@example.com");
    const { token } = await createTestInvite(user.id, user.email);
    
    const res = await request(app)
      .post("/api/v1/auth/platform-invite/accept")
      .send({ token, password: "securepassword123" });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe("super_user");
    
    // Verify the invite is marked as accepted
    const [updatedInvite] = await db.select()
      .from(platformInvitations)
      .where(eq(platformInvitations.targetUserId, user.id));
    
    expect(updatedInvite.status).toBe("accepted");
    expect(updatedInvite.usedAt).not.toBeNull();
    
    // Verify password was set on the user
    const [updatedUser] = await db.select()
      .from(users)
      .where(eq(users.id, user.id));
    
    expect(updatedUser.passwordHash).not.toBeNull();
  });

  it("should return 410 for already used invite", async () => {
    const app = createTestApp();
    const user = await createTestUser("test-platform-double@example.com");
    const { token } = await createTestInvite(user.id, user.email, "accepted");
    
    const res = await request(app)
      .post("/api/v1/auth/platform-invite/accept")
      .send({ token, password: "securepassword123" });
    
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("TOKEN_ALREADY_USED");
  });
});

describe("Token Security", () => {
  it("should generate 64-character hex tokens", () => {
    const token = crypto.randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/i.test(token)).toBe(true);
  });

  it("should produce consistent hash for same token", () => {
    const token = crypto.randomBytes(32).toString("hex");
    const hash1 = crypto.createHash("sha256").update(token).digest("hex");
    const hash2 = crypto.createHash("sha256").update(token).digest("hex");
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different tokens", () => {
    const token1 = crypto.randomBytes(32).toString("hex");
    const token2 = crypto.randomBytes(32).toString("hex");
    const hash1 = crypto.createHash("sha256").update(token1).digest("hex");
    const hash2 = crypto.createHash("sha256").update(token2).digest("hex");
    expect(hash1).not.toBe(hash2);
  });
});

/**
 * Super Admin Management Endpoints
 * 
 * These tests exercise the actual superAdmin router endpoints for platform admin management.
 * They use a mock authenticated super user to test access control and CRUD operations.
 */

function createAuthenticatedTestApp(mockUser: any) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  
  // Mock authentication middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).user = mockUser;
    (req as any).isAuthenticated = () => !!mockUser;
    next();
  });
  
  // Mount the super admin routes
  app.use("/api/v1/super", superAdminRoutes);
  
  return app;
}

describe("Platform Admin Management Endpoints", () => {
  let superUserId: string;
  
  beforeEach(async () => {
    await clearTestData();
    // Create a super user for authentication
    const user = await createTestUser("test-platform-auth-super@example.com");
    superUserId = user.id;
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe("Access Control", () => {
    it("should reject unauthenticated requests to list admins", async () => {
      const app = createAuthenticatedTestApp(null);
      
      const res = await request(app).get("/api/v1/super/admins");
      
      expect(res.status).toBe(401);
    });

    it("should reject non-super users from listing admins", async () => {
      const regularUser = {
        id: "regular-user",
        email: "regular@example.com",
        role: UserRole.EMPLOYEE,
        isActive: true,
      };
      const app = createAuthenticatedTestApp(regularUser);
      
      const res = await request(app).get("/api/v1/super/admins");
      
      expect(res.status).toBe(403);
    });

    it("should allow super users to list admins", async () => {
      const superUser = {
        id: superUserId,
        email: "test-platform-auth-super@example.com",
        role: UserRole.SUPER_USER,
        isActive: true,
      };
      const app = createAuthenticatedTestApp(superUser);
      
      const res = await request(app).get("/api/v1/super/admins");
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("Create Platform Admin", () => {
    it("should create a new platform admin", async () => {
      const superUser = {
        id: superUserId,
        email: "test-platform-auth-super@example.com",
        role: UserRole.SUPER_USER,
        isActive: true,
      };
      const app = createAuthenticatedTestApp(superUser);
      
      const res = await request(app)
        .post("/api/v1/super/admins")
        .send({
          email: "test-platform-new-admin@example.com",
          firstName: "New",
          lastName: "Admin",
        });
      
      expect(res.status).toBe(201);
      expect(res.body.email).toBe("test-platform-new-admin@example.com");
      expect(res.body.role).toBe("super_user");
      expect(res.body.passwordSet).toBe(false);
    });

    it("should reject duplicate email", async () => {
      const superUser = {
        id: superUserId,
        email: "test-platform-auth-super@example.com",
        role: UserRole.SUPER_USER,
        isActive: true,
      };
      const app = createAuthenticatedTestApp(superUser);
      
      // Try to create with existing email
      const res = await request(app)
        .post("/api/v1/super/admins")
        .send({
          email: "test-platform-auth-super@example.com", // Already exists
          firstName: "Duplicate",
          lastName: "Admin",
        });
      
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("EMAIL_EXISTS");
    });
  });

  describe("Generate Invite Link", () => {
    it("should generate invite link for platform admin", async () => {
      const superUser = {
        id: superUserId,
        email: "test-platform-auth-super@example.com",
        role: UserRole.SUPER_USER,
        isActive: true,
      };
      const app = createAuthenticatedTestApp(superUser);
      
      // Create a new admin to invite
      const newAdmin = await createTestUser("test-platform-invite-target@example.com");
      
      const res = await request(app)
        .post(`/api/v1/super/admins/${newAdmin.id}/invite`)
        .send({ expiresInDays: 7 });
      
      expect(res.status).toBe(200);
      expect(res.body.inviteUrl).toContain("/auth/platform-invite?token=");
      expect(res.body.tokenMasked).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();
    });

    it("should revoke previous pending invites when generating new one", async () => {
      const superUser = {
        id: superUserId,
        email: "test-platform-auth-super@example.com",
        role: UserRole.SUPER_USER,
        isActive: true,
      };
      const app = createAuthenticatedTestApp(superUser);
      
      // Create a new admin
      const newAdmin = await createTestUser("test-platform-revoke-test@example.com");
      
      // Generate first invite
      await request(app)
        .post(`/api/v1/super/admins/${newAdmin.id}/invite`)
        .send({ expiresInDays: 7 });
      
      // Generate second invite (should revoke first)
      await request(app)
        .post(`/api/v1/super/admins/${newAdmin.id}/invite`)
        .send({ expiresInDays: 7 });
      
      // Check that first invite is revoked
      const invites = await db.select()
        .from(platformInvitations)
        .where(eq(platformInvitations.targetUserId, newAdmin.id));
      
      const revokedCount = invites.filter(i => i.status === "revoked").length;
      const pendingCount = invites.filter(i => i.status === "pending").length;
      
      expect(revokedCount).toBe(1);
      expect(pendingCount).toBe(1);
    });
  });

  describe("Last Admin Protection", () => {
    it("should prevent deactivating the last active super admin", async () => {
      // Clean up all other super users first, leaving only one
      await db.delete(users).where(
        and(
          eq(users.role, UserRole.SUPER_USER),
          sql`email NOT LIKE 'test-platform-%'`
        )
      );
      
      const superUser = {
        id: superUserId,
        email: "test-platform-auth-super@example.com",
        role: UserRole.SUPER_USER,
        isActive: true,
      };
      const app = createAuthenticatedTestApp(superUser);
      
      const res = await request(app)
        .patch(`/api/v1/super/admins/${superUserId}`)
        .send({ isActive: false });
      
      // Should fail with last admin protection
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("LAST_ADMIN_PROTECTION");
    });
  });
});
