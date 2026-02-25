import type { Express } from "express";
import type { Server } from "http";
import { registerRoute, clearRouteRegistry, getRouteRegistry } from "./routeRegistry";
import { apiNoCacheMiddleware } from "../middleware/apiCacheControl";
import {
  startDeadlineChecker,
  startFollowUpChecker,
} from "../features/notifications/notification.service";

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
import tasksRouter from "./domains/tasks.router";
import subtasksRouter from "./domains/subtasks.router";
import projectNotesRouter from "./domains/project-notes.router";
import workspacesRouter from "./domains/workspaces.router";
import teamsRouter from "./domains/teams.router";
import workloadReportsRouter from "./domains/workload-reports.router";
import analyticsReportsRouter from "./domains/analytics-reports.router";
import reportsV2WorkloadRouter from "./domains/reports-v2-workload.router";
import reportsV2EmployeeRouter from "./domains/reports-v2-employee.router";
import reportsV2ClientRouter from "./domains/reports-v2-client.router";
import { jobsRouter } from "../jobs/jobs.router";
import supportRouter from "./domains/support.router";
import clientDocumentsRouter from "./domains/clientDocuments.router";
import automationRouter from "./domains/automation.router";
import assetsRouter from "./domains/assets.router";
import tenantDefaultDocsRouter from "./domains/tenantDefaultDocs.router";
import controlCenterRouter from "./domains/controlCenter.router";
import emailTemplatesRouter from "./domains/emailTemplates.router";
import fileServeRouter from "./domains/fileServe.router";

import usersRouter from "../routes/users.router";
import crmRouter from "../routes/crm.router";
import clientsRouter from "../routes/clients.router";
import { searchRouter } from "../routes/modules/search/search.router";
import featuresRoutes from "../features";
import superAdminRoutes from "../routes/superAdmin";
import superSystemStatusRouter from "../routes/super/systemStatus.router";
import superIntegrationsRouter from "../routes/super/integrations.router";
import superChatExportRouter from "../routes/super/chatExport.router";
import superDebugRoutes from "../routes/superDebug";
import chatDebugRoutes from "../routes/chatDebug";
import superChatRoutes from "../routes/superChat";
import systemStatusRoutes from "../routes/systemStatus";
import tenantOnboardingRoutes from "../routes/tenantOnboarding";
import tenantBillingRoutes from "../routes/tenantBilling";
import tenantDataRoutes from "../routes/tenantData";
import projectsDashboardRoutes from "../routes/projectsDashboard";
import emailOutboxRoutes from "../routes/emailOutbox";
import chatRetentionRoutes from "../routes/chatRetention";
import tenancyHealthRoutes from "../routes/tenancyHealth";
import webhookRoutes from "../routes/webhooks";

interface DomainEntry {
  path: string;
  router: import("express").Router;
  policy: import("./policy/requiredMiddleware").PolicyName;
  domain: string;
  description: string;
}

const REGISTERED_DOMAINS: DomainEntry[] = [
  {
    path: "/api/v1/system",
    router: systemRouter,
    policy: "superUser",
    domain: "system-integrations",
    description: "System integration management.",
  },
  {
    path: "/api/v1/system",
    router: emailTemplatesRouter,
    policy: "superUser",
    domain: "email-templates",
    description: "Email template management.",
  },
  {
    path: "/api",
    router: tagsRouter,
    policy: "authTenant",
    domain: "tags",
    description: "Tag CRUD and task-tag associations.",
  },
  {
    path: "/api",
    router: activityRouter,
    policy: "authTenant",
    domain: "activity",
    description: "Activity log CRUD.",
  },
  {
    path: "/api",
    router: commentsRouter,
    policy: "authTenant",
    domain: "comments",
    description: "Comment CRUD, resolve/unresolve.",
  },
  {
    path: "/api",
    router: presenceRouter,
    policy: "authTenant",
    domain: "presence",
    description: "User presence tracking.",
  },
  {
    path: "/api",
    router: aiRouter,
    policy: "authTenant",
    domain: "ai",
    description: "AI integration routes (OpenAI).",
  },
  {
    path: "/api",
    router: attachmentsRouter,
    policy: "authTenant",
    domain: "attachments",
    description: "Attachment CRUD, presign, upload complete, download.",
  },
  {
    path: "/api",
    router: flagsRouter,
    policy: "authTenant",
    domain: "flags",
    description: "CRM feature flags.",
  },
  {
    path: "/api/v1/uploads",
    router: uploadsRouter,
    policy: "authTenant",
    domain: "uploads",
    description: "Unified file upload: presign, proxy upload, status.",
  },
  {
    path: "/api/v1/chat",
    router: chatRouter,
    policy: "authTenant",
    domain: "chat",
    description: "Internal chat system: channels, DMs, messages, threads, reads, search, uploads, mentions.",
  },
  {
    path: "/api",
    router: timeRouter,
    policy: "authTenant",
    domain: "time",
    description: "Time tracking: active timers, time entries CRUD, calendar views, reporting, CSV export.",
  },
  {
    path: "/api",
    router: projectsRouter,
    policy: "authTenant",
    domain: "projects",
    description: "Projects core: CRUD, members, visibility (hide/unhide), sections, task reorder.",
  },
  {
    path: "/api",
    router: tasksRouter,
    policy: "authTenant",
    domain: "tasks",
    description: "Tasks core: CRUD, assignees, watchers, move, personal tasks, personal sections, child tasks, calendar events, project activity.",
  },
  {
    path: "/api",
    router: subtasksRouter,
    policy: "authTenant",
    domain: "subtasks",
    description: "Subtasks: CRUD, move, assignees, tags, comments, full detail.",
  },
  {
    path: "/api",
    router: projectNotesRouter,
    policy: "authTenant",
    domain: "project-notes",
    description: "Project notes: CRUD, categories, version history.",
  },
  {
    path: "/api",
    router: workspacesRouter,
    policy: "authTenant",
    domain: "workspaces",
    description: "Workspaces: CRUD, members, current workspace.",
  },
  {
    path: "/api",
    router: teamsRouter,
    policy: "authTenant",
    domain: "teams",
    description: "Teams: CRUD, members, tenant-scoped.",
  },
  {
    path: "/api/v1",
    router: workloadReportsRouter,
    policy: "authTenant",
    domain: "workload-reports",
    description: "Workload reports: tasks-by-employee, unassigned, by-status, by-priority, summary.",
  },
  {
    path: "/api/v1",
    router: analyticsReportsRouter,
    policy: "authTenant",
    domain: "analytics-reports",
    description: "Analytics reports: overview KPIs, task analytics, client analytics dashboards.",
  },
  {
    path: "/api/reports/v2",
    router: reportsV2WorkloadRouter,
    policy: "authTenant",
    domain: "reports-v2-workload",
    description: "Workload Reports V2: team summary, employee drilldown, capacity planning, risk flags.",
  },
  {
    path: "/api/reports/v2",
    router: reportsV2EmployeeRouter,
    policy: "authTenant",
    domain: "reports-v2-employee",
    description: "Employee Command Center: overview, workload, time, capacity, risk, trends.",
  },
  {
    path: "/api/reports/v2",
    router: reportsV2ClientRouter,
    policy: "authTenant",
    domain: "reports-v2-client",
    description: "Client Command Center: overview, activity, time, tasks, SLA, risk.",
  },
  {
    path: "/api",
    router: jobsRouter,
    policy: "authTenant",
    domain: "jobs",
    description: "Background job queue: list, get, cancel jobs, queue stats.",
  },
  {
    path: "/api/v1/support",
    router: supportRouter,
    policy: "authTenant",
    domain: "support",
    description: "Support tickets: CRUD, messages, status transitions, assignment.",
  },
  {
    path: "/api/v1",
    router: clientDocumentsRouter,
    policy: "authTenant",
    domain: "client-documents",
    description: "Client Documents 2.0: folder CRUD, file presign/complete/move/rename/delete/download, bulk ops.",
  },
  {
    path: "/api/v1",
    router: automationRouter,
    policy: "authTenant",
    domain: "automation",
    description: "Client stage automation: CRUD rules, dry-run, audit events.",
  },
  {
    path: "/api/v1",
    router: assetsRouter,
    policy: "authTenant",
    domain: "assets",
    description: "Asset Library: unified asset management, folders, upload, download.",
  },
  {
    path: "/api/v1",
    router: tenantDefaultDocsRouter,
    policy: "authTenant",
    domain: "tenant-default-docs",
    description: "Tenant Default Documents: canonical tenant-wide document library managed by admins.",
  },
  {
    path: "/api/v1",
    router: controlCenterRouter,
    policy: "authTenant",
    domain: "control-center",
    description: "Control Center widget layout: GET/PUT pinned widget configuration per tenant/workspace.",
  },
  {
    path: "/api/v1/files/serve",
    router: fileServeRouter,
    policy: "authTenant",
    domain: "file-serve",
    description: "File serving and download endpoints.",
  },
  {
    path: "/api",
    router: usersRouter,
    policy: "authTenant",
    domain: "users",
    description: "User management: CRUD, invitations, password reset, avatar, UI preferences.",
  },
  {
    path: "/api",
    router: crmRouter,
    policy: "authTenant",
    domain: "crm",
    description: "CRM: client summaries, metrics, pipeline, follow-ups, bulk update, access control, portal dashboard.",
  },
  {
    path: "/api",
    router: clientsRouter,
    policy: "authTenant",
    domain: "clients",
    description: "Client management: CRUD, contacts, invites, projects, divisions, notes, documents.",
  },
  {
    path: "/api",
    router: searchRouter,
    policy: "authTenant",
    domain: "search",
    description: "Global search for command palette and quick navigation.",
  },
  {
    path: "/api",
    router: featuresRoutes,
    policy: "authTenant",
    domain: "features",
    description: "Feature modules: client features, notifications, client portal, templates.",
  },
  {
    path: "/api/v1/super",
    router: superAdminRoutes,
    policy: "superUser",
    domain: "super-admin",
    description: "Super admin aggregator: tenants, workspaces, users, invitations, settings, integrations, health, seeding.",
  },
  {
    path: "/api/v1/super",
    router: superSystemStatusRouter,
    policy: "superUser",
    domain: "super-system-status",
    description: "Super admin system status: health, auth diagnostics, DB schema status.",
  },
  {
    path: "/api/v1/super",
    router: superIntegrationsRouter,
    policy: "superUser",
    domain: "super-integrations",
    description: "Super admin integrations: Mailgun, Cloudflare R2, Stripe global config.",
  },
  {
    path: "/api/v1/super/chat",
    router: superChatExportRouter,
    policy: "superUser",
    domain: "super-chat-export",
    description: "Super admin chat export: create, download, list exports.",
  },
  {
    path: "/api/v1/super/debug",
    router: superDebugRoutes,
    policy: "superUser",
    domain: "super-debug",
    description: "Super admin debug tools: quarantine, backfill, diagnostics.",
  },
  {
    path: "/api/v1/super/debug/chat",
    router: chatDebugRoutes,
    policy: "superUser",
    domain: "super-debug-chat",
    description: "Chat debug: metrics, events, sockets, diagnostics.",
  },
  {
    path: "/api/v1/super/chat",
    router: superChatRoutes,
    policy: "superUser",
    domain: "super-chat-monitoring",
    description: "Super admin chat monitoring: read-only access to tenant chat history.",
  },
  {
    path: "/api/v1/super/status",
    router: systemStatusRoutes,
    policy: "authOnly",
    domain: "system-status",
    description: "System status: health checks, DB diagnostics, S3 status. /health/db is public.",
  },
  {
    path: "/api/v1/tenant",
    router: tenantOnboardingRoutes,
    policy: "authOnly",
    domain: "tenant-onboarding",
    description: "Tenant onboarding: context, settings, branding, integrations, agreements.",
  },
  {
    path: "/api/v1/tenant",
    router: tenantBillingRoutes,
    policy: "authOnly",
    domain: "tenant-billing",
    description: "Tenant billing: Stripe integration, invoices, portal sessions.",
  },
  {
    path: "/api/v1/tenant/data",
    router: tenantDataRoutes,
    policy: "authTenant",
    domain: "tenant-data",
    description: "Tenant data: import/export clients, users, time entries. Asana import pipeline.",
  },
  {
    path: "/api/v1",
    router: projectsDashboardRoutes,
    policy: "authTenant",
    domain: "projects-dashboard",
    description: "Projects dashboard: analytics, forecast, summary.",
  },
  {
    path: "/api/v1",
    router: emailOutboxRoutes,
    policy: "authOnly",
    domain: "email-outbox",
    description: "Email outbox: logs, stats, resend for tenant admins and super admins.",
  },
  {
    path: "/api/v1",
    router: chatRetentionRoutes,
    policy: "authOnly",
    domain: "chat-retention",
    description: "Chat retention: settings, archive runs, stats, export for super and tenant admins.",
  },
  {
    path: "/api",
    router: tenancyHealthRoutes,
    policy: "authOnly",
    domain: "tenancy-health",
    description: "Tenancy health: integrity checks, warnings, backfill, orphans, constraints, remediation, migrations.",
  },
  {
    path: "/api/v1/webhooks",
    router: webhookRoutes,
    policy: "public",
    domain: "webhooks",
    description: "Stripe webhook routes (signature-verified, no session auth).",
  },
];

export async function mountAllRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  clearRouteRegistry();

  app.use("/api", apiNoCacheMiddleware);

  for (const entry of REGISTERED_DOMAINS) {
    registerRoute({
      path: entry.path,
      router: entry.router,
      policy: entry.policy,
      domain: entry.domain,
      description: entry.description,
      legacy: false,
    });
  }

  const registry = getRouteRegistry();
  for (const route of registry) {
    if (route.router) {
      app.use(route.path, route.router);
    }
  }

  startDeadlineChecker();
  startFollowUpChecker();

  return httpServer;
}
