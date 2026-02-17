import type { Express } from "express";
import type { Server } from "http";
import { registerRoute, clearRouteRegistry } from "./routeRegistry";
import { registerRoutes as legacyRegisterRoutes } from "../routes";
import systemRouter from "./domains/system.router";
import tagsRouter from "./domains/tags.router";

export async function mountAllRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  clearRouteRegistry();

  registerRoute({
    path: "/api",
    router: null as any,
    policy: "authTenant",
    domain: "legacy-aggregated",
    description: "Legacy aggregated routes from routes/index.ts. Auth+tenant guards applied globally in routes.ts with path-based allowlists.",
    legacy: true,
  });

  registerRoute({
    path: "/api/v1/webhooks",
    router: null as any,
    policy: "public",
    domain: "webhooks",
    description: "Stripe webhook routes (signature-verified, no session auth). Exempt from auth/tenant/CSRF.",
    legacy: true,
  });

  registerRoute({
    path: "/api/v1/system",
    router: systemRouter,
    policy: "superUser",
    domain: "system-integrations",
    description: "System integration management. Pilot: migrated to new router factory with superUser policy.",
    legacy: false,
  });

  registerRoute({
    path: "/api/v1/super",
    router: null as any,
    policy: "superUser",
    domain: "super-admin",
    description: "Super admin routes. Exempt from tenant context requirement.",
    legacy: true,
  });

  registerRoute({
    path: "/api/v1/tenant",
    router: null as any,
    policy: "authOnly",
    domain: "tenant-onboarding",
    description: "Tenant onboarding and billing. Auth required, tenant context exempt during onboarding.",
    legacy: true,
  });

  registerRoute({
    path: "/api/v1/chat",
    router: null as any,
    policy: "authTenant",
    domain: "chat",
    description: "Internal chat system with Socket.IO integration.",
    legacy: true,
  });

  registerRoute({
    path: "/api/v1/presence",
    router: null as any,
    policy: "authTenant",
    domain: "presence",
    description: "User presence tracking for real-time status.",
    legacy: true,
  });

  registerRoute({
    path: "/api/v1/ai",
    router: null as any,
    policy: "authTenant",
    domain: "ai",
    description: "AI integration routes (OpenAI).",
    legacy: true,
  });

  registerRoute({
    path: "/api/v1/uploads",
    router: null as any,
    policy: "authTenant",
    domain: "uploads",
    description: "File upload routes with rate limiting.",
    legacy: true,
  });

  registerRoute({
    path: "/api",
    router: tagsRouter,
    policy: "authTenant",
    domain: "tags",
    description: "Tag CRUD and task-tag associations. Migrated from legacy routes/tags.router.ts (Prompt #2).",
    legacy: false,
  });

  await legacyRegisterRoutes(httpServer, app);

  app.use("/api/v1/system", systemRouter);
  app.use("/api", tagsRouter);

  return httpServer;
}
