/**
 * Server Test Harness
 * 
 * Provides a minimal test setup that can:
 * - Build the express app with all middleware
 * - Mount all routers
 * - Test health and ready endpoints
 * 
 * Usage:
 *   import { createTestApp, getTestApp } from "./server-harness";
 *   
 *   beforeAll(async () => {
 *     await createTestApp();
 *   });
 *   
 *   it("should respond to health check", async () => {
 *     const res = await request(getTestApp()).get("/health");
 *     expect(res.status).toBe(200);
 *   });
 */

import express, { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { db, checkDbHealth } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { requestIdMiddleware } from "../middleware/requestId";
import { errorHandler } from "../middleware/errorHandler";
import { apiJsonResponseGuard, apiNotFoundHandler } from "../middleware/apiJsonGuard";

let testApp: Express | null = null;

export interface TestAppOptions {
  withAuth?: boolean;
  mockUserId?: string;
  mockTenantId?: string | null;
  mockUserRole?: string;
}

/**
 * Create a minimal express app for testing
 * Mounts core middleware and health endpoints
 */
export function createTestApp(options: TestAppOptions = {}): Express {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Request ID middleware
  app.use(requestIdMiddleware);
  
  // Session middleware (for auth tests)
  app.use(session({
    secret: "test-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  
  // Mock auth middleware if auth is enabled
  if (options.withAuth && options.mockUserId) {
    app.use((req: any, res: Response, next: NextFunction) => {
      req.user = {
        id: options.mockUserId,
        tenantId: options.mockTenantId,
        role: options.mockUserRole || "employee",
      };
      req.isAuthenticated = () => true;
      next();
    });
  }
  
  // Health endpoints (always available)
  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });
  
  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });
  
  app.get("/ready", async (_req, res) => {
    try {
      const dbStatus = await checkDbHealth();
      if (dbStatus.connected) {
        res.json({ 
          status: "ready", 
          checks: { database: true } 
        });
      } else {
        res.status(503).json({ 
          status: "not_ready", 
          checks: { database: false },
          error: dbStatus.error 
        });
      }
    } catch (err: any) {
      res.status(503).json({ 
        status: "error", 
        error: err.message 
      });
    }
  });
  
  // Error handler
  app.use(errorHandler);
  
  testApp = app;
  return app;
}

/**
 * Create a test app with full router registration
 * This mirrors the production app setup more closely
 */
export async function createFullTestApp(options: TestAppOptions = {}): Promise<Express> {
  const app = createTestApp(options);
  
  // Create a mock HTTP server for route registration
  const { createServer } = await import("http");
  const httpServer = createServer(app);
  
  // Import and register routes dynamically to avoid circular dependencies
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);
  
  // API error handlers (after routes)
  app.use(apiJsonResponseGuard);
  app.use("/api", apiNotFoundHandler);
  app.use(errorHandler);
  
  testApp = app;
  return app;
}

/**
 * Get the current test app instance
 */
export function getTestApp(): Express {
  if (!testApp) {
    throw new Error("Test app not initialized. Call createTestApp() first.");
  }
  return testApp;
}

/**
 * Reset the test app instance
 */
export function resetTestApp(): void {
  testApp = null;
}

/**
 * Check if database is available for tests
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const status = await checkDbHealth();
    return status.connected;
  } catch {
    return false;
  }
}
