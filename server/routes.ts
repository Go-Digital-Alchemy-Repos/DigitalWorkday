/**
 * Main API Routes — Thin Aggregator
 * 
 * Mounts global middleware and sub-routers.
 * 
 * Domain routers are split between two systems:
 *   - **Migrated** (server/http/domains/): tags, activity, comments, presence,
 *     ai, attachments, uploads, chat, time, projects, tasks, subtasks, system
 *     — registered via routeRegistry + routerFactory with policy enforcement.
 *   - **Legacy** (server/routes/): workspaces, teams, users, clients, crm,
 *     search, features, super-admin, tenant, system-status, email, chat-retention
 *     — aggregated in routes/index.ts, mounted here under /api.
 *
 * This file handles:
 *   1. Global /api auth middleware (requireAuth)
 *   2. Global /api tenant context middleware (requireTenantContext)
 *   3. Mounting sub-routes and webhooks
 *   4. Starting background notification checkers
 */
import type { Express } from "express";
import type { Server } from "http";
import { requireAuth } from "./auth";
import { requireTenantContext } from "./middleware/tenantContext";
import { apiNoCacheMiddleware } from "./middleware/apiCacheControl";
import subRoutes from "./routes/index";
import webhookRoutes from "./routes/webhooks";
import {
  startDeadlineChecker,
  startFollowUpChecker,
} from "./features/notifications/notification.service";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.use("/api", apiNoCacheMiddleware);

  // Protect all /api routes except /api/auth/*, /api/v1/auth/*, /api/v1/super/bootstrap, /api/health, and /api/v1/webhooks/*
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || 
        req.path.startsWith("/v1/auth/") || 
        req.path === "/v1/super/bootstrap" || 
        req.path === "/health" ||
        req.path.startsWith("/v1/webhooks/")) {
      return next();
    }
    return requireAuth(req, res, next);
  });
  
  // Enforce tenant context for all API routes except /api/auth/*, /api/health, /api/v1/super/*, /api/v1/tenant/*, and /api/v1/webhooks/*
  // SuperUsers can access without tenant context; regular users must have tenantId
  // Tenant onboarding routes (/api/v1/tenant/*) are exempt from strict tenant context enforcement
  // as they need to work during onboarding when tenant context is being set up
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || 
        req.path === "/health" || 
        req.path.startsWith("/v1/super/") ||
        req.path.startsWith("/v1/tenant/") ||
        req.path.startsWith("/v1/webhooks/")) {
      return next();
    }
    return requireTenantContext(req, res, next);
  });

  // Mount sub-routes (all domain routers aggregated in routes/index.ts)
  app.use("/api", subRoutes);
  
  // Mount webhook routes (bypasses auth, uses signature verification)
  app.use("/api/v1/webhooks", webhookRoutes);

  // Start the deadline notification checker (runs periodically)
  startDeadlineChecker();
  startFollowUpChecker();

  return httpServer;
}
