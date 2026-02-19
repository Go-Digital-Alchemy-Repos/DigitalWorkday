import { Router } from "express";
import express from "express";
import { storage } from "../storage";
import { db } from "../db";
import { clients, users, timeEntries, projects, tasks, UserRole, asanaImportRuns, workspaces } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../auth";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { AppError, handleRouteError } from "../lib/errors";
import { parseCsv } from "../imports/csvParser";
import { createJob, getJob, getJobsForTenant, updateJob, jobToDTO } from "../imports/jobStore";
import { validateJob, executeJob } from "../imports/importEngine";
import { ENTITY_FIELD_MAP, suggestMappings, type EntityType, type ColumnMapping } from "../../shared/imports/fieldCatalog";
import { tenantIntegrationService } from "../services/tenantIntegrations";
import { AsanaClient } from "../services/asana/asanaClient";
import { AsanaImportPipeline, type AsanaImportOptions } from "../services/asana/importPipeline";
import { recordTenantAuditEvent } from "./superAdmin";

const largeJsonParser = express.json({ limit: "200mb" });

const router = Router();

function requireTenantAdmin(req: any, res: any, next: any) {
  const user = req.user as any;
  const effectiveTenantId = getEffectiveTenantId(req);

  if (!effectiveTenantId) {
    throw AppError.forbidden("No tenant context");
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
    throw AppError.forbidden("Admin access required");
  }

  req.effectiveTenantId = effectiveTenantId;
  next();
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map(row => row.map(escapeCsvField).join(","));
  return [headerLine, ...dataLines].join("\n");
}

router.get("/export/clients", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const tenantClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));

    const headers = ["companyName", "displayName", "industry", "website", "phone", "email", "status", "notes", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"];
    const rows = tenantClients.map(c => [
      c.companyName, c.displayName, c.industry, c.website, c.phone, c.email, c.status, c.notes, c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.country,
    ]);

    const csv = generateCsv(headers, rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-clients.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[tenant-export] Failed to export clients:", error);
    res.status(500).json({ error: "Failed to export clients" });
  }
});

router.get("/export/users", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));

    const headers = ["email", "firstName", "lastName", "name", "role", "isActive"];
    const rows = tenantUsers.map(u => [u.email, u.firstName, u.lastName, u.name, u.role, u.isActive ? "true" : "false"]);

    const csv = generateCsv(headers, rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-users.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[tenant-export] Failed to export users:", error);
    res.status(500).json({ error: "Failed to export users" });
  }
});

router.get("/export/time-entries", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const entries = await db.select({
      entry: timeEntries,
      userName: users.name,
      userEmail: users.email,
      clientName: clients.companyName,
      projectName: projects.name,
      taskTitle: tasks.title,
    })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .where(eq(timeEntries.tenantId, tenantId))
      .orderBy(desc(timeEntries.startTime));

    const headers = ["userEmail", "userName", "clientName", "projectName", "taskTitle", "description", "scope", "startTime", "endTime", "durationSeconds", "isManual"];
    const rows = entries.map(e => [
      e.userEmail, e.userName, e.clientName, e.projectName, e.taskTitle,
      e.entry.description, e.entry.scope, e.entry.startTime?.toISOString(),
      e.entry.endTime?.toISOString(), e.entry.durationSeconds, e.entry.isManual ? "true" : "false",
    ]);

    const csv = generateCsv(headers, rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-time-entries.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[tenant-export] Failed to export time entries:", error);
    res.status(500).json({ error: "Failed to export time entries" });
  }
});

router.post("/import/clients", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { rows: importRows } = req.body as { rows: Array<Record<string, string>> };

    if (!Array.isArray(importRows) || importRows.length === 0) {
      return res.status(400).json({ error: "No data to import" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

    const results: Array<{ name: string; status: "created" | "skipped" | "error"; reason?: string }> = [];
    let created = 0, skipped = 0, errors = 0;

    for (const row of importRows) {
      const companyName = row.companyName?.trim();
      if (!companyName) {
        results.push({ name: "(empty)", status: "skipped", reason: "Missing company name" });
        skipped++;
        continue;
      }

      const existing = await db.select().from(clients).where(and(eq(clients.tenantId, tenantId), eq(clients.companyName, companyName)));
      if (existing.length > 0) {
        results.push({ name: companyName, status: "skipped", reason: "Client already exists" });
        skipped++;
        continue;
      }

      try {
        await db.insert(clients).values({
          tenantId, workspaceId: primaryWorkspaceId, companyName,
          displayName: row.displayName?.trim() || null, industry: row.industry?.trim() || null,
          website: row.website?.trim() || null, phone: row.phone?.trim() || null,
          email: row.email?.trim() || null, status: row.status?.trim() || "active",
          notes: row.notes?.trim() || null, addressLine1: row.addressLine1?.trim() || null,
          addressLine2: row.addressLine2?.trim() || null, city: row.city?.trim() || null,
          state: row.state?.trim() || null, postalCode: row.postalCode?.trim() || null,
          country: row.country?.trim() || null,
        });
        results.push({ name: companyName, status: "created" });
        created++;
      } catch (err) {
        console.error(`[tenant-import] Failed to create client ${companyName}:`, err);
        results.push({ name: companyName, status: "error", reason: "Database error" });
        errors++;
      }
    }

    await recordTenantAuditEvent(tenantId, "clients_imported", `Imported ${created} clients (${skipped} skipped, ${errors} errors)`, req.user?.id, { created, skipped, errors });
    res.json({ created, skipped, errors, results });
  } catch (error) {
    console.error("[tenant-import] Failed to import clients:", error);
    res.status(500).json({ error: "Failed to import clients" });
  }
});

router.post("/import/time-entries", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { rows: importRows, matchBy } = req.body as {
      rows: Array<Record<string, string>>;
      matchBy?: { client?: "name"; project?: "name"; user?: "email" };
    };

    if (!Array.isArray(importRows) || importRows.length === 0) {
      return res.status(400).json({ error: "No data to import" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
    const usersByEmail = new Map(tenantUsers.map(u => [u.email.toLowerCase(), u]));

    const tenantClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
    const clientsByName = new Map(tenantClients.map(c => [c.companyName.toLowerCase(), c]));

    const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
    const projectsByName = new Map(tenantProjects.map(p => [p.name.toLowerCase(), p]));

    const results: Array<{ name: string; status: "created" | "skipped" | "error"; reason?: string }> = [];
    let created = 0, skipped = 0, errors = 0;

    for (const row of importRows) {
      const userEmail = row.userEmail?.trim().toLowerCase();
      const user = userEmail ? usersByEmail.get(userEmail) : null;

      if (!user) {
        results.push({ name: `Entry for ${userEmail || "unknown"}`, status: "skipped", reason: "User not found" });
        skipped++;
        continue;
      }

      const clientName = row.clientName?.trim().toLowerCase();
      const client = clientName ? clientsByName.get(clientName) : null;

      const projectName = row.projectName?.trim().toLowerCase();
      const project = projectName ? projectsByName.get(projectName) : null;

      const startTimeStr = row.startTime?.trim();
      const endTimeStr = row.endTime?.trim();

      if (!startTimeStr) {
        results.push({ name: `Entry for ${userEmail}`, status: "skipped", reason: "Missing start time" });
        skipped++;
        continue;
      }

      const startTime = new Date(startTimeStr);
      const endTime = endTimeStr ? new Date(endTimeStr) : null;

      if (isNaN(startTime.getTime())) {
        results.push({ name: `Entry for ${userEmail}`, status: "skipped", reason: "Invalid start time" });
        skipped++;
        continue;
      }

      let durationSeconds = parseInt(row.durationSeconds || "0", 10);
      if (isNaN(durationSeconds) && endTime && !isNaN(endTime.getTime())) {
        durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      }

      try {
        await db.insert(timeEntries).values({
          tenantId, workspaceId: primaryWorkspaceId, userId: user.id,
          clientId: client?.id || null, projectId: project?.id || null, taskId: null,
          description: row.description?.trim() || null, scope: row.scope?.trim() || "in_scope",
          startTime, endTime, durationSeconds: durationSeconds || 0,
          isManual: row.isManual?.toLowerCase() === "true",
        });
        results.push({ name: `${startTimeStr} - ${user.email}`, status: "created" });
        created++;
      } catch (err) {
        console.error(`[tenant-import] Failed to create time entry:`, err);
        results.push({ name: `${startTimeStr} - ${user.email}`, status: "error", reason: "Database error" });
        errors++;
      }
    }

    await recordTenantAuditEvent(tenantId, "time_entries_imported", `Imported ${created} time entries (${skipped} skipped, ${errors} errors)`, req.user?.id, { created, skipped, errors });
    res.json({ created, skipped, errors, results });
  } catch (error) {
    console.error("[tenant-import] Failed to import time entries:", error);
    res.status(500).json({ error: "Failed to import time entries" });
  }
});

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const MAX_ROW_COUNT = 50000;
const VALID_ENTITY_TYPES: EntityType[] = ["clients", "projects", "tasks", "users", "admins", "time_entries"];

router.post("/import/jobs", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { entityType } = req.body;

    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ error: `Invalid entity type. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const job = createJob(tenantId, req.user!.id, entityType);
    await recordTenantAuditEvent(tenantId, "import_job_created", `Import job created for ${entityType}`, req.user!.id, { jobId: job.id, entityType });
    res.json({ job: jobToDTO(job) });
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to create job:", error);
    res.status(500).json({ error: "Failed to create import job" });
  }
});

router.post("/import/jobs/:jobId/upload", largeJsonParser, requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job || job.tenantId !== tenantId) return res.status(404).json({ error: "Job not found" });

    const { csvText, fileName } = req.body;
    if (!csvText || typeof csvText !== "string") return res.status(400).json({ error: "csvText is required" });
    if (csvText.length > MAX_FILE_SIZE) return res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });

    const parsed = parseCsv(csvText, MAX_ROW_COUNT);
    if (parsed.rows.length === 0) return res.status(400).json({ error: "CSV file is empty or has no data rows" });
    if (parsed.rawRowCount > MAX_ROW_COUNT) return res.status(400).json({ error: `Too many rows. Maximum is ${MAX_ROW_COUNT}.` });

    const fields = ENTITY_FIELD_MAP[job.entityType];
    const suggestedMapping = suggestMappings(parsed.headers, fields);

    updateJob(jobId, {
      fileName: fileName || "upload.csv",
      rawRows: parsed.rows,
      columns: parsed.headers,
      sampleRows: parsed.rows.slice(0, 20),
      mapping: suggestedMapping,
      status: "draft",
    });

    res.json({
      columns: parsed.headers,
      sampleRows: parsed.rows.slice(0, 20),
      rowCount: parsed.rows.length,
      suggestedMapping,
      fields,
    });
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to upload:", error);
    res.status(500).json({ error: "Failed to process upload" });
  }
});

router.put("/import/jobs/:jobId/mapping", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job || job.tenantId !== tenantId) return res.status(404).json({ error: "Job not found" });

    const { mapping } = req.body as { mapping: ColumnMapping[] };
    if (!Array.isArray(mapping)) return res.status(400).json({ error: "mapping must be an array" });

    updateJob(jobId, { mapping });
    res.json({ ok: true });
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to update mapping:", error);
    res.status(500).json({ error: "Failed to update mapping" });
  }
});

router.post("/import/jobs/:jobId/validate", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job || job.tenantId !== tenantId) return res.status(404).json({ error: "Job not found" });
    if (job.rawRows.length === 0) return res.status(400).json({ error: "No data uploaded yet" });

    const summary = await validateJob(job);
    updateJob(jobId, { status: "validated", validationSummary: summary });

    await recordTenantAuditEvent(tenantId, "import_job_validated", `Import job validated for ${job.entityType}: ${summary.wouldCreate} create, ${summary.wouldSkip} skip, ${summary.wouldFail} fail`, req.user!.id, { jobId, ...summary });
    res.json({ summary, errorsPreview: summary.errors.slice(0, 50), warningsPreview: summary.warnings.slice(0, 50) });
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to validate:", error);
    res.status(500).json({ error: "Failed to validate import" });
  }
});

router.post("/import/jobs/:jobId/run", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job || job.tenantId !== tenantId) return res.status(404).json({ error: "Job not found" });
    if (job.rawRows.length === 0) return res.status(400).json({ error: "No data uploaded yet" });

    const autoCreateMissing = req.body?.autoCreateMissing === true;
    updateJob(jobId, { status: "running", progress: { processed: 0, total: job.rawRows.length }, autoCreateMissing });

    const summary = await executeJob(job);

    await recordTenantAuditEvent(tenantId, "import_job_executed", `Import completed for ${job.entityType}: ${summary.created} created, ${summary.skipped} skipped, ${summary.failed} failed`, req.user!.id, { jobId, ...summary });

    const updatedJob = getJob(jobId);
    res.json({ summary, job: updatedJob ? jobToDTO(updatedJob) : null });
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to execute:", error);
    res.status(500).json({ error: "Failed to execute import" });
  }
});

router.get("/import/jobs/:jobId", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job || job.tenantId !== tenantId) return res.status(404).json({ error: "Job not found" });
    res.json({ job: jobToDTO(job), progress: job.progress });
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to get job:", error);
    res.status(500).json({ error: "Failed to get job" });
  }
});

router.get("/import/jobs", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const jobList = getJobsForTenant(tenantId);
    res.json({ jobs: jobList.map(jobToDTO) });
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to list jobs:", error);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

router.get("/import/jobs/:jobId/errors.csv", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job || job.tenantId !== tenantId) return res.status(404).json({ error: "Job not found" });

    const errorRows = job.errorRows || [];
    const headers = ["row", "primaryKey", "errorCode", "message"];
    const csvLines = [
      headers.join(","),
      ...errorRows.map(e => [e.row, escapeCsvField(e.primaryKey), escapeCsvField(e.errorCode), escapeCsvField(e.message)].join(",")),
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="import-errors-${jobId}.csv"`);
    res.send(csvLines.join("\n"));
  } catch (error) {
    console.error("[tenant-import-wizard] Failed to get error CSV:", error);
    res.status(500).json({ error: "Failed to generate error CSV" });
  }
});

router.get("/import/fields/:entityType", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const { entityType } = req.params;
    if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
      return res.status(400).json({ error: "Invalid entity type" });
    }
    const fields = ENTITY_FIELD_MAP[entityType as EntityType];
    res.json({ fields });
  } catch (error) {
    res.status(500).json({ error: "Failed to get fields" });
  }
});

const importOptionsSchema = z.object({
  asanaWorkspaceGid: z.string().min(1),
  asanaWorkspaceName: z.string().optional(),
  projectGids: z.array(z.string().min(1)).min(1),
  targetWorkspaceId: z.string().min(1),
  options: z.object({
    autoCreateClients: z.boolean().default(false),
    autoCreateProjects: z.boolean().default(true),
    autoCreateTasks: z.boolean().default(true),
    autoCreateUsers: z.boolean().default(false),
    fallbackUnassigned: z.boolean().default(true),
    clientMappingStrategy: z.enum(["single", "team", "per_project", "custom_field"]).default("per_project"),
    singleClientId: z.string().optional(),
    singleClientName: z.string().optional(),
    clientCustomFieldName: z.string().optional(),
    projectClientMap: z.record(z.string(), z.object({
      clientId: z.string().optional(),
      clientName: z.string().optional(),
    })).optional(),
  }),
});

router.post("/asana/connect", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { personalAccessToken } = req.body;

    if (!personalAccessToken || typeof personalAccessToken !== "string" || personalAccessToken.length < 10) {
      return res.status(400).json({ error: "A valid Personal Access Token is required" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const client = new AsanaClient(personalAccessToken);
    const testResult = await client.testConnection();
    if (!testResult.ok) {
      return res.status(400).json({ error: `Asana connection failed: ${testResult.error}` });
    }

    await tenantIntegrationService.upsertIntegration(tenantId, "asana", {
      publicConfig: { enabled: true },
      secretConfig: { personalAccessToken },
    });

    res.json({ connected: true, user: testResult.user });
  } catch (error: any) {
    console.error("[tenant-asana] Connect error:", error);
    res.status(500).json({ error: "Failed to connect to Asana" });
  }
});

router.post("/asana/test", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const client = await AsanaClient.fromTenant(tenantId);
    const result = await client.testConnection();
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/asana/status", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const integration = await tenantIntegrationService.getIntegration(tenantId, "asana");
    res.json({
      connected: integration?.status === "configured" || integration?.status === "active",
      status: integration?.status || "not_configured",
      secretConfigured: integration?.secretConfigured || false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/asana/disconnect", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    await tenantIntegrationService.upsertIntegration(tenantId, "asana", {
      publicConfig: { enabled: false },
      secretConfig: { personalAccessToken: "" },
    });
    res.json({ disconnected: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/asana/workspaces", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const client = await AsanaClient.fromTenant(tenantId);
    const workspacesList = await client.getWorkspaces();
    res.json({ workspaces: workspacesList });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/asana/workspaces/:workspaceGid/projects", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { workspaceGid } = req.params;
    const client = await AsanaClient.fromTenant(tenantId);
    const projectsList = await client.getProjects(workspaceGid);
    res.json({ projects: projectsList });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/asana/validate", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const parsed = importOptionsSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const client = await AsanaClient.fromTenant(tenantId);
    const pipeline = new AsanaImportPipeline(
      tenantId, parsed.targetWorkspaceId, req.user?.id || "",
      parsed.options as AsanaImportOptions, client
    );

    const result = await pipeline.validate(parsed.asanaWorkspaceGid, parsed.projectGids);
    res.json(result);
  } catch (error: any) {
    console.error("[tenant-asana] Validate error:", error);
    res.status(400).json({ error: error.message });
  }
});

router.post("/asana/execute", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const parsed = importOptionsSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const actorUserId = req.user?.id || "";

    const [run] = await db.insert(asanaImportRuns).values({
      tenantId, actorUserId,
      asanaWorkspaceGid: parsed.asanaWorkspaceGid,
      asanaWorkspaceName: parsed.asanaWorkspaceName || null,
      asanaProjectGids: parsed.projectGids,
      targetWorkspaceId: parsed.targetWorkspaceId,
      options: parsed.options,
      status: "running", phase: "Starting...",
      startedAt: new Date(),
    }).returning();

    res.json({ runId: run.id, status: "running" });

    const client = await AsanaClient.fromTenant(tenantId);
    const pipeline = new AsanaImportPipeline(
      tenantId, parsed.targetWorkspaceId, actorUserId,
      parsed.options as AsanaImportOptions, client
    );

    try {
      const result = await pipeline.execute(
        parsed.asanaWorkspaceGid, parsed.projectGids,
        async (phase: string) => {
          await db.update(asanaImportRuns).set({ phase }).where(eq(asanaImportRuns.id, run.id));
        }
      );

      await db.update(asanaImportRuns).set({
        status: result.errors.length > 0 ? "completed_with_errors" : "completed",
        phase: "Done",
        executionSummary: result.counts,
        errorLog: result.errors.length > 0 ? result.errors : null,
        completedAt: new Date(),
      }).where(eq(asanaImportRuns.id, run.id));
    } catch (err: any) {
      await db.update(asanaImportRuns).set({
        status: "failed", phase: "Error",
        errorLog: [{ entityType: "system", asanaGid: "", name: "", message: err.message }],
        completedAt: new Date(),
      }).where(eq(asanaImportRuns.id, run.id));
    }
  } catch (error: any) {
    console.error("[tenant-asana] Execute error:", error);
    res.status(400).json({ error: error.message });
  }
});

router.get("/asana/runs", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const runs = await db.select().from(asanaImportRuns)
      .where(eq(asanaImportRuns.tenantId, tenantId))
      .orderBy(desc(asanaImportRuns.createdAt))
      .limit(20);
    res.json({ runs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/asana/runs/:runId", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { runId } = req.params;
    const [run] = await db.select().from(asanaImportRuns)
      .where(and(eq(asanaImportRuns.id, runId), eq(asanaImportRuns.tenantId, tenantId)))
      .limit(1);
    if (!run) return res.status(404).json({ error: "Import run not found" });
    res.json(run);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/asana/local-workspaces", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const ws = await db.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    res.json({ workspaces: ws });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/asana/local-clients", requireAuth, requireTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const cls = await db.select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));
    res.json({ clients: cls });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
