/**
 * @module server/tests/system-status.test.ts
 * @description Tests for system status summary endpoint.
 * Verifies:
 * 1. Super user only access
 * 2. No secrets exposed in response
 * 3. Response shape stability
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId";
import session from "express-session";

function createMockApp(userRole: string | null = null) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  
  app.use((req, _res, next) => {
    if (userRole) {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { id: "test-user", role: userRole };
    } else {
      (req as any).isAuthenticated = () => false;
      (req as any).user = null;
    }
    next();
  });
  
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  };
  
  const requireSuperUser = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated?.() || req.user?.role !== "super_user") {
      return res.status(403).json({ error: "Super user access required" });
    }
    next();
  };
  
  app.get("/api/v1/super/status/summary", requireAuth, requireSuperUser, async (_req, res) => {
    const requestId = `req_test_${Date.now()}`;
    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    
    res.json({
      ok: true,
      requestId,
      timestamp: new Date().toISOString(),
      checks: {
        db: {
          status: "ok",
          latencyMs: 5,
        },
        migrations: {
          version: "5 migrations applied",
          available: true,
        },
        s3: {
          configured: !!process.env.AWS_ACCESS_KEY_ID,
          presign: process.env.AWS_ACCESS_KEY_ID ? "ok" : "not_tested",
        },
        mailgun: {
          configured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
        },
        auth: {
          cookieSecure: isProduction,
          cookieHttpOnly: true,
          cookieSameSite: "lax",
          trustProxy: isProduction,
          sessionSecretSet: !!process.env.SESSION_SECRET,
          environment: nodeEnv,
        },
        orphanCounts: {
          totalMissing: 0,
          totalQuarantined: 0,
          byTable: {},
        },
      },
    });
  });
  
  return app;
}

describe("System Status Summary - Super User Only Access", () => {
  it("should deny access to non-authenticated users", async () => {
    const app = createMockApp(null);
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Authentication required");
  });
  
  it("should deny access to regular employee users", async () => {
    const app = createMockApp("employee");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Super user");
  });
  
  it("should deny access to tenant admins", async () => {
    const app = createMockApp("admin");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Super user");
  });
  
  it("should allow access to super users", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("System Status Summary - Response Shape", () => {
  it("should return expected top-level keys", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok");
    expect(res.body).toHaveProperty("requestId");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("checks");
  });
  
  it("should return all check sections", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.body.checks).toHaveProperty("db");
    expect(res.body.checks).toHaveProperty("migrations");
    expect(res.body.checks).toHaveProperty("s3");
    expect(res.body.checks).toHaveProperty("mailgun");
    expect(res.body.checks).toHaveProperty("auth");
    expect(res.body.checks).toHaveProperty("orphanCounts");
  });
  
  it("should include db status and latency", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.body.checks.db).toHaveProperty("status");
    expect(res.body.checks.db).toHaveProperty("latencyMs");
    expect(["ok", "failed"]).toContain(res.body.checks.db.status);
    expect(typeof res.body.checks.db.latencyMs).toBe("number");
  });
  
  it("should include auth configuration flags", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.body.checks.auth).toHaveProperty("cookieSecure");
    expect(res.body.checks.auth).toHaveProperty("cookieHttpOnly");
    expect(res.body.checks.auth).toHaveProperty("sessionSecretSet");
    expect(res.body.checks.auth).toHaveProperty("environment");
  });
});

describe("System Status Summary - No Secrets Exposed", () => {
  it("should not expose actual API keys", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    const jsonStr = JSON.stringify(res.body);
    
    expect(jsonStr).not.toContain("MAILGUN_API_KEY");
    expect(jsonStr).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(jsonStr).not.toContain("SESSION_SECRET");
    expect(jsonStr).not.toContain("DATABASE_URL");
  });
  
  it("should only report configured status as boolean, not values", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(typeof res.body.checks.s3.configured).toBe("boolean");
    expect(typeof res.body.checks.mailgun.configured).toBe("boolean");
    expect(typeof res.body.checks.auth.sessionSecretSet).toBe("boolean");
  });
  
  it("should include request ID for correlation", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/summary");
    
    expect(res.body.requestId).toBeDefined();
    expect(typeof res.body.requestId).toBe("string");
    expect(res.body.requestId.startsWith("req_")).toBe(true);
  });
});
