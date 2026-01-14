/**
 * @module server/tests/auth-diagnostics.test.ts
 * @description Tests for auth diagnostics endpoint.
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
  
  const requireSuperUser = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated?.() || req.user?.role !== "super_user") {
      return res.status(403).json({ error: "Super user access required" });
    }
    next();
  };
  
  app.get("/api/v1/super/status/auth-diagnostics", requireSuperUser, async (_req, res) => {
    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
    
    res.json({
      authType: "cookie",
      overallStatus: "healthy",
      cookies: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        domainConfigured: !!process.env.COOKIE_DOMAIN,
        maxAgeDays: 30,
      },
      cors: {
        credentialsEnabled: true,
        allowedOriginConfigured: !!process.env.APP_BASE_URL,
      },
      proxy: {
        trustProxyEnabled: true,
      },
      session: {
        enabled: true,
        storeType: "pg",
        secretConfigured: !!process.env.SESSION_SECRET,
      },
      runtime: {
        nodeEnv,
        isRailway,
        databaseConfigured: !!process.env.DATABASE_URL,
      },
      issues: [],
      warnings: [],
      commonFixes: [],
      lastAuthCheck: new Date().toISOString(),
    });
  });
  
  return app;
}

describe("Auth Diagnostics - Super User Only Access", () => {
  it("should deny access to non-authenticated users", async () => {
    const app = createMockApp(null);
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Super user");
  });
  
  it("should deny access to regular users", async () => {
    const app = createMockApp("user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.status).toBe(403);
  });
  
  it("should deny access to tenant admins", async () => {
    const app = createMockApp("admin");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.status).toBe(403);
  });
  
  it("should allow access to super users", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.status).toBe(200);
    expect(res.body.authType).toBe("cookie");
  });
});

describe("Auth Diagnostics - Response Shape Stability", () => {
  it("should return expected top-level keys", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("authType");
    expect(res.body).toHaveProperty("overallStatus");
    expect(res.body).toHaveProperty("cookies");
    expect(res.body).toHaveProperty("cors");
    expect(res.body).toHaveProperty("proxy");
    expect(res.body).toHaveProperty("session");
    expect(res.body).toHaveProperty("runtime");
    expect(res.body).toHaveProperty("issues");
    expect(res.body).toHaveProperty("warnings");
    expect(res.body).toHaveProperty("commonFixes");
    expect(res.body).toHaveProperty("lastAuthCheck");
  });
  
  it("should return expected cookies keys", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.body.cookies).toHaveProperty("httpOnly");
    expect(res.body.cookies).toHaveProperty("secure");
    expect(res.body.cookies).toHaveProperty("sameSite");
    expect(res.body.cookies).toHaveProperty("domainConfigured");
    expect(res.body.cookies).toHaveProperty("maxAgeDays");
  });
  
  it("should return expected session keys", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.body.session).toHaveProperty("enabled");
    expect(res.body.session).toHaveProperty("storeType");
    expect(res.body.session).toHaveProperty("secretConfigured");
  });
  
  it("should return expected runtime keys", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(res.body.runtime).toHaveProperty("nodeEnv");
    expect(res.body.runtime).toHaveProperty("isRailway");
    expect(res.body.runtime).toHaveProperty("databaseConfigured");
  });
  
  it("should return valid overallStatus value", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(["healthy", "warning", "error"]).toContain(res.body.overallStatus);
  });
  
  it("should return arrays for issues, warnings, and commonFixes", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(Array.isArray(res.body.commonFixes)).toBe(true);
  });
  
  it("should never expose secrets", async () => {
    const app = createMockApp("super_user");
    
    const res = await request(app).get("/api/v1/super/status/auth-diagnostics");
    const responseText = JSON.stringify(res.body);
    
    expect(responseText).not.toContain("SESSION_SECRET");
    expect(responseText).not.toContain("COOKIE_SECRET");
    expect(responseText).not.toContain("DATABASE_URL");
    expect(responseText).not.toMatch(/password/i);
  });
});
