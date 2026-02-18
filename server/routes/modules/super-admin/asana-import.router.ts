import { Router } from "express";
import { requireSuperUser } from "../../../middleware/tenantContext";
import { storage } from "../../../storage";
import { tenantIntegrationService } from "../../../services/tenantIntegrations";
import { AsanaClient } from "../../../services/asana/asanaClient";
import { AsanaImportPipeline, type AsanaImportOptions } from "../../../services/asana/importPipeline";
import { db } from "../../../db";
import { asanaImportRuns, workspaces } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

export const asanaImportRouter = Router();

asanaImportRouter.post("/tenants/:tenantId/asana/connect", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
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

    res.json({
      connected: true,
      user: testResult.user,
    });
  } catch (error: any) {
    console.error("[asana] Connect error:", error);
    res.status(500).json({ error: "Failed to connect to Asana" });
  }
});

asanaImportRouter.post("/tenants/:tenantId/asana/test", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const client = await AsanaClient.fromTenant(tenantId);
    const result = await client.testConnection();
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

asanaImportRouter.get("/tenants/:tenantId/asana/status", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
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

asanaImportRouter.post("/tenants/:tenantId/asana/disconnect", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    await tenantIntegrationService.upsertIntegration(tenantId, "asana", {
      publicConfig: { enabled: false },
      secretConfig: { personalAccessToken: "" },
    });
    res.json({ disconnected: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

asanaImportRouter.get("/tenants/:tenantId/asana/workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const client = await AsanaClient.fromTenant(tenantId);
    const workspacesList = await client.getWorkspaces();
    res.json({ workspaces: workspacesList });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

asanaImportRouter.get("/tenants/:tenantId/asana/workspaces/:workspaceGid/projects", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, workspaceGid } = req.params;
    const client = await AsanaClient.fromTenant(tenantId);
    const projectsList = await client.getProjects(workspaceGid);
    res.json({ projects: projectsList });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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

asanaImportRouter.post("/tenants/:tenantId/asana/validate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const parsed = importOptionsSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const client = await AsanaClient.fromTenant(tenantId);
    const pipeline = new AsanaImportPipeline(
      tenantId,
      parsed.targetWorkspaceId,
      (req as any).user?.id || "",
      parsed.options as AsanaImportOptions,
      client
    );

    const result = await pipeline.validate(parsed.asanaWorkspaceGid, parsed.projectGids);
    res.json(result);
  } catch (error: any) {
    console.error("[asana] Validate error:", error);
    res.status(400).json({ error: error.message });
  }
});

asanaImportRouter.post("/tenants/:tenantId/asana/execute", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const parsed = importOptionsSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const actorUserId = (req as any).user?.id || "";

    const [run] = await db.insert(asanaImportRuns).values({
      tenantId,
      actorUserId,
      asanaWorkspaceGid: parsed.asanaWorkspaceGid,
      asanaWorkspaceName: parsed.asanaWorkspaceName || null,
      asanaProjectGids: parsed.projectGids,
      targetWorkspaceId: parsed.targetWorkspaceId,
      options: parsed.options,
      status: "running",
      phase: "Starting...",
      startedAt: new Date(),
    }).returning();

    res.json({ runId: run.id, status: "running" });

    const client = await AsanaClient.fromTenant(tenantId);
    const pipeline = new AsanaImportPipeline(
      tenantId,
      parsed.targetWorkspaceId,
      actorUserId,
      parsed.options as AsanaImportOptions,
      client
    );

    try {
      const result = await pipeline.execute(
        parsed.asanaWorkspaceGid,
        parsed.projectGids,
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
        status: "failed",
        phase: "Error",
        errorLog: [{ entityType: "system", asanaGid: "", name: "", message: err.message }],
        completedAt: new Date(),
      }).where(eq(asanaImportRuns.id, run.id));
    }
  } catch (error: any) {
    console.error("[asana] Execute error:", error);
    res.status(400).json({ error: error.message });
  }
});

asanaImportRouter.get("/tenants/:tenantId/asana/runs", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const runs = await db
      .select()
      .from(asanaImportRuns)
      .where(eq(asanaImportRuns.tenantId, tenantId))
      .orderBy(desc(asanaImportRuns.createdAt))
      .limit(20);
    res.json({ runs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

asanaImportRouter.get("/tenants/:tenantId/asana/runs/:runId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, runId } = req.params;
    const [run] = await db
      .select()
      .from(asanaImportRuns)
      .where(and(eq(asanaImportRuns.id, runId), eq(asanaImportRuns.tenantId, tenantId)))
      .limit(1);

    if (!run) return res.status(404).json({ error: "Import run not found" });
    res.json(run);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

asanaImportRouter.get("/tenants/:tenantId/asana/local-workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const ws = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    res.json({ workspaces: ws });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

asanaImportRouter.get("/tenants/:tenantId/asana/local-clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { default: { clients: clientsTable } } = await import("@shared/schema").then(m => ({ default: m }));
    const cls = await db
      .select({ id: clientsTable.id, companyName: clientsTable.companyName })
      .from(clientsTable)
      .where(eq(clientsTable.tenantId, tenantId));
    res.json({ clients: cls });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
