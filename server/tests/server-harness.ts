/**
 * Server Test Harness
 * 
 * Provides helpers for building test Express apps using the shared appFactory.
 * No port binding — tests use supertest(app) directly.
 * 
 * Usage:
 *   import { buildTestApp, buildFullTestApp } from "./server-harness";
 *   
 *   const app = buildTestApp({ mockUserId: "u1", mockTenantId: "t1" });
 *   const res = await request(app).get("/health");
 *   expect(res.status).toBe(200);
 */

import { type Express } from "express";
import { createApp, createAppWithRoutes, type CreateAppOptions } from "../appFactory";
import { checkDbHealth } from "../db";

export interface TestAppOptions {
  withAuth?: boolean;
  mockUserId?: string;
  mockTenantId?: string | null;
  mockUserRole?: string;
}

function toFactoryOptions(opts: TestAppOptions): CreateAppOptions {
  if (opts.mockUserId) {
    return {
      testMode: true,
      mockUser: {
        id: opts.mockUserId,
        tenantId: opts.mockTenantId ?? null,
        role: opts.mockUserRole ?? "employee",
      },
    };
  }
  return { testMode: true };
}

/**
 * Create a minimal express app for testing (no routes, no port binding)
 */
export function createTestApp(options: TestAppOptions = {}): Express {
  const { app } = createApp(toFactoryOptions(options));
  return app;
}

/**
 * Alias matching the new naming convention
 */
export const buildTestApp = createTestApp;

/**
 * Create a test app with full router registration (no port binding)
 */
export async function createFullTestApp(options: TestAppOptions = {}): Promise<Express> {
  const { app } = await createAppWithRoutes(toFactoryOptions(options));
  return app;
}

/**
 * Alias matching the new naming convention
 */
export const buildFullTestApp = createFullTestApp;

let _testApp: Express | null = null;

/**
 * Get the current test app instance (legacy compat)
 */
export function getTestApp(): Express {
  if (!_testApp) {
    throw new Error("Test app not initialized. Call createTestApp() first.");
  }
  return _testApp;
}

/**
 * Reset the test app instance
 */
export function resetTestApp(): void {
  _testApp = null;
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
