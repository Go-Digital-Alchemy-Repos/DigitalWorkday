import type { Express } from "express";
import type { Server } from "http";
import { registerRoute, clearRouteRegistry, getRouteRegistry } from "./routeRegistry";
import { registerRoutes as legacyRegisterRoutes } from "../routes";

import systemRouter from "./domains/system.router";
import tagsRouter from "./domains/tags.router";
import activityRouter from "./domains/activity.router";
import commentsRouter from "./domains/comments.router";
import presenceRouter from "./domains/presence.router";
import aiRouter from "./domains/ai.router";
import attachmentsRouter from "./domains/attachments.router";
import flagsRouter from "./domains/flags.router";
import uploadsRouter from "./domains/uploads.router";
import chatRouter from "./domains/chat.router";
import timeRouter from "./domains/time.router";
import projectsRouter from "./domains/projects.router";

interface DomainEntry {
  path: string;
  router: import("express").Router;
  policy: import("./policy/requiredMiddleware").PolicyName;
  domain: string;
  description: string;
}

const MIGRATED_DOMAINS: DomainEntry[] = [
  {
    path: "/api/v1/system",
    router: systemRouter,
    policy: "superUser",
    domain: "system-integrations",
    description: "System integration management. Pilot: migrated to new router factory with superUser policy.",
  },
  {
    path: "/api",
    router: tagsRouter,
    policy: "authTenant",
    domain: "tags",
    description: "Tag CRUD and task-tag associations. Migrated from legacy routes/tags.router.ts (Prompt #2).",
  },
  {
    path: "/api",
    router: activityRouter,
    policy: "authTenant",
    domain: "activity",
    description: "Activity log CRUD. Migrated from legacy routes/activity.router.ts.",
  },
  {
    path: "/api",
    router: commentsRouter,
    policy: "authTenant",
    domain: "comments",
    description: "Comment CRUD, resolve/unresolve. Migrated from legacy routes/comments.router.ts (Prompt #4).",
  },
  {
    path: "/api",
    router: presenceRouter,
    policy: "authTenant",
    domain: "presence",
    description: "User presence tracking. Migrated from legacy routes/presence.ts (Prompt #5).",
  },
  {
    path: "/api",
    router: aiRouter,
    policy: "authTenant",
    domain: "ai",
    description: "AI integration routes (OpenAI). Migrated from legacy routes/ai.ts (Prompt #5).",
  },
  {
    path: "/api",
    router: attachmentsRouter,
    policy: "authTenant",
    domain: "attachments",
    description: "Attachment CRUD, presign, upload complete, download. Migrated from legacy routes/attachments.router.ts (Prompt #6).",
  },
  {
    path: "/api",
    router: flagsRouter,
    policy: "authTenant",
    domain: "flags",
    description: "CRM feature flags. Extracted from attachments router to restore domain boundaries (Prompt #7).",
  },
  {
    path: "/api/v1/uploads",
    router: uploadsRouter,
    policy: "authTenant",
    domain: "uploads",
    description: "Unified file upload: presign, proxy upload, status. Migrated from legacy routes/uploads.ts (Prompt #7).",
  },
  {
    path: "/api/v1/chat",
    router: chatRouter,
    policy: "authTenant",
    domain: "chat",
    description: "Internal chat system: channels, DMs, messages, threads, reads, search, uploads, mentions. Migrated from legacy routes/chat.ts (Prompt #8).",
  },
  {
    path: "/api",
    router: timeRouter,
    policy: "authTenant",
    domain: "time",
    description: "Time tracking: active timers, time entries CRUD, calendar views, reporting, CSV export. Migrated from legacy routes/timeTracking.router.ts + routes/timeTracking.ts (Prompt #10).",
  },
  {
    path: "/api",
    router: projectsRouter,
    policy: "authTenant",
    domain: "projects",
    description: "Projects core: CRUD, members, visibility (hide/unhide), sections, task reorder. Migrated from legacy routes/projects.router.ts (Prompt #11).",
  },
];

interface LegacyEntry {
  path: string;
  policy: import("./policy/requiredMiddleware").PolicyName;
  domain: string;
  description: string;
}

const LEGACY_DOMAINS: LegacyEntry[] = [
  {
    path: "/api",
    policy: "authTenant",
    domain: "legacy-aggregated",
    description: "Legacy aggregated routes from routes/index.ts. Auth+tenant guards applied globally in routes.ts with path-based allowlists.",
  },
  {
    path: "/api/v1/webhooks",
    policy: "public",
    domain: "webhooks",
    description: "Stripe webhook routes (signature-verified, no session auth). Exempt from auth/tenant/CSRF.",
  },
  {
    path: "/api/v1/super",
    policy: "superUser",
    domain: "super-admin",
    description: "Super admin routes. Exempt from tenant context requirement.",
  },
  {
    path: "/api/v1/tenant",
    policy: "authOnly",
    domain: "tenant-onboarding",
    description: "Tenant onboarding and billing. Auth required, tenant context exempt during onboarding.",
  },
  // chat: migrated to server/http/domains/chat.router.ts (Prompt #8)
  // {
  //   path: "/api/v1/chat",
  //   policy: "authTenant",
  //   domain: "chat",
  //   description: "Internal chat system with Socket.IO integration.",
  // },
  // uploads: migrated to server/http/domains/uploads.router.ts (Prompt #7)
  // {
  //   path: "/api/v1/uploads",
  //   policy: "authTenant",
  //   domain: "uploads",
  //   description: "File upload routes with rate limiting.",
  // },
];

export async function mountAllRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  clearRouteRegistry();

  for (const entry of LEGACY_DOMAINS) {
    registerRoute({
      path: entry.path,
      router: null as any,
      policy: entry.policy,
      domain: entry.domain,
      description: entry.description,
      legacy: true,
    });
  }

  for (const entry of MIGRATED_DOMAINS) {
    registerRoute({
      path: entry.path,
      router: entry.router,
      policy: entry.policy,
      domain: entry.domain,
      description: entry.description,
      legacy: false,
    });
  }

  await legacyRegisterRoutes(httpServer, app);

  const registry = getRouteRegistry();
  for (const route of registry) {
    if (!route.legacy && route.router) {
      app.use(route.path, route.router);
    }
  }

  return httpServer;
}
