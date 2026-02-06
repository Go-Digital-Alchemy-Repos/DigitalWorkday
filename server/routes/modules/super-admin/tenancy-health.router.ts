import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { tenants, users, projects, tasks, teams, clients, TenantStatus, UserRole } from '@shared/schema';
import { eq, and, count, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { tenancyHealthService } from '../../../services/tenancyHealth';

export const tenancyHealthRouter = Router();

const QUARANTINE_TENANT_SLUG = "quarantine";

tenancyHealthRouter.get("/tenancy/health", requireSuperUser, async (req, res) => {
  try {
    const tenancyMode = process.env.TENANCY_ENFORCEMENT || "soft";
    
    const [quarantineTenant] = await db.select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
      .limit(1);
    const quarantineTenantId = quarantineTenant?.id;
    
    let activeQuery = db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.ACTIVE));
    if (quarantineTenantId) {
      activeQuery = db.select({ count: count() })
        .from(tenants)
        .where(and(
          eq(tenants.status, TenantStatus.ACTIVE),
          ne(tenants.id, quarantineTenantId)
        ));
    }
    const activeResult = await activeQuery;
    const activeTenantCount = activeResult[0]?.count || 0;
    
    const usersWithoutTenant = await db.select({ count: count() })
      .from(users)
      .where(and(
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER)
      ));
    
    const projectsWithoutTenant = await db.select({ count: count() })
      .from(projects)
      .where(isNull(projects.tenantId));
    
    const tasksWithoutTenant = await db.select({ count: count() })
      .from(tasks)
      .where(isNull(tasks.tenantId));
    
    const teamsWithoutTenant = await db.select({ count: count() })
      .from(teams)
      .where(isNull(teams.tenantId));
    
    const clientsWithoutTenant = await db.select({ count: count() })
      .from(clients)
      .where(isNull(clients.tenantId));
    
    let quarantinedCounts = {
      users: 0,
      projects: 0,
      tasks: 0,
      teams: 0,
    };
    
    if (quarantineTenantId) {
      const quarantinedUsers = await db.select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, quarantineTenantId));
      quarantinedCounts.users = quarantinedUsers[0]?.count || 0;
      
      const quarantinedProjects = await db.select({ count: count() })
        .from(projects)
        .where(eq(projects.tenantId, quarantineTenantId));
      quarantinedCounts.projects = quarantinedProjects[0]?.count || 0;
      
      const quarantinedTasks = await db.select({ count: count() })
        .from(tasks)
        .where(eq(tasks.tenantId, quarantineTenantId));
      quarantinedCounts.tasks = quarantinedTasks[0]?.count || 0;
      
      const quarantinedTeams = await db.select({ count: count() })
        .from(teams)
        .where(eq(teams.tenantId, quarantineTenantId));
      quarantinedCounts.teams = quarantinedTeams[0]?.count || 0;
    }
    
    const missingCounts = {
      users: usersWithoutTenant[0]?.count || 0,
      projects: projectsWithoutTenant[0]?.count || 0,
      tasks: tasksWithoutTenant[0]?.count || 0,
      teams: teamsWithoutTenant[0]?.count || 0,
      clients: clientsWithoutTenant[0]?.count || 0,
    };
    
    const totalMissing = 
      missingCounts.users + 
      missingCounts.projects + 
      missingCounts.tasks + 
      missingCounts.teams + 
      missingCounts.clients;
    
    const totalQuarantined = 
      quarantinedCounts.users + 
      quarantinedCounts.projects + 
      quarantinedCounts.tasks + 
      quarantinedCounts.teams;
    
    const missingTenantIds = [
      { table: "users", missingTenantIdCount: missingCounts.users },
      { table: "projects", missingTenantIdCount: missingCounts.projects },
      { table: "tasks", missingTenantIdCount: missingCounts.tasks },
      { table: "teams", missingTenantIdCount: missingCounts.teams },
      { table: "clients", missingTenantIdCount: missingCounts.clients },
    ];
    
    res.json({
      currentMode: tenancyMode,
      totalMissing,
      totalQuarantined,
      activeTenantCount,
      missingByTable: missingCounts,
      missingTenantIds,
      quarantinedByTable: quarantinedCounts,
      hasQuarantineTenant: !!quarantineTenantId,
      warningStats: {
        last24Hours: 0,
        last7Days: 0,
        total: 0,
      },
    });
  } catch (error) {
    console.error("[tenancy] Failed to get tenancy health:", error);
    res.status(500).json({ error: "Failed to get tenancy health" });
  }
});

tenancyHealthRouter.get("/system/health/tenancy", requireSuperUser, async (req, res) => {
  try {
    const summary = await tenancyHealthService.getGlobalHealthSummary();
    res.json(summary);
  } catch (error) {
    console.error("[tenancy-health] Failed to get global health:", error);
    res.status(500).json({ error: "Failed to get global tenancy health" });
  }
});

const repairPreviewSchema = z.object({
  tenantId: z.string().uuid().optional(),
  tables: z.array(z.string()).optional(),
  limit: z.number().min(1).max(1000).optional().default(500),
});

tenancyHealthRouter.post("/system/health/tenancy/repair-preview", requireSuperUser, async (req, res) => {
  try {
    const data = repairPreviewSchema.parse(req.body);
    const preview = await tenancyHealthService.generateRepairPreview({
      tenantId: data.tenantId,
      tables: data.tables,
      limit: data.limit,
    });
    res.json(preview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("[tenancy-health] Failed to generate repair preview:", error);
    res.status(500).json({ error: "Failed to generate repair preview" });
  }
});

const repairApplySchema = z.object({
  tenantId: z.string().uuid().optional(),
  tables: z.array(z.string()).optional(),
  limit: z.number().min(1).max(1000).optional().default(500),
  applyOnlyHighConfidence: z.boolean().optional().default(true),
});

tenancyHealthRouter.post("/system/health/tenancy/repair-apply", requireSuperUser, async (req, res) => {
  try {
    const confirmHeader = req.headers["x-confirm-repair"];
    if (confirmHeader !== "true") {
      return res.status(400).json({ 
        error: "Repair confirmation required",
        message: "Include header 'X-Confirm-Repair: true' to confirm this operation",
      });
    }
    
    const data = repairApplySchema.parse(req.body);
    const requestId = req.headers["x-request-id"] as string || `repair_${Date.now()}`;
    const userId = req.user?.id || "unknown";
    
    const result = await tenancyHealthService.applyRepairs(
      {
        tenantId: data.tenantId,
        tables: data.tables,
        limit: data.limit,
        applyOnlyHighConfidence: data.applyOnlyHighConfidence,
      },
      { userId, requestId }
    );
    
    console.log(`[tenancy-repair] Repair applied by ${userId}: ${result.totalUpdated} updated, ${result.totalSkipped} skipped (requestId=${requestId})`);
    
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("[tenancy-health] Failed to apply repairs:", error);
    res.status(500).json({ error: "Failed to apply repairs" });
  }
});

tenancyHealthRouter.post("/tenancy/backfill", requireSuperUser, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "true" || req.body.dryRun === true;
    
    const TENANT_SCOPED_TABLES = [
      "workspaces", "teams", "clients", "projects", "tasks", "time_entries",
      "active_timers", "invitations", "personal_task_sections", "task_assignees",
      "task_watchers", "client_divisions", "division_members", "chat_channels",
      "chat_channel_members", "chat_dm_threads", "chat_dm_members", "chat_messages",
      "chat_mentions", "chat_reads", "chat_attachments"
    ];

    interface BackfillResult {
      table: string;
      nullBefore: number;
      updated: number;
      remaining: number;
      details?: string;
    }

    const results: BackfillResult[] = [];

    for (const table of TENANT_SCOPED_TABLES) {
      try {
        const countResult = await db.execute<{ count: string }>(
          sql.raw(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id IS NULL`)
        );
        const nullBefore = parseInt(countResult.rows[0]?.count || "0", 10);

        if (nullBefore === 0) {
          results.push({ table, nullBefore: 0, updated: 0, remaining: 0 });
          continue;
        }

        let updated = 0;
        let details = "";

        if (!dryRun) {
          switch (table) {
            case "teams":
              const teamsResult = await db.execute(sql.raw(`
                UPDATE teams t SET tenant_id = w.tenant_id
                FROM workspaces w WHERE t.workspace_id = w.id
                AND t.tenant_id IS NULL AND w.tenant_id IS NOT NULL
              `));
              updated = (teamsResult as any).rowCount || 0;
              break;
            case "projects":
              const projectsResult = await db.execute(sql.raw(`
                UPDATE projects p SET tenant_id = COALESCE(
                  (SELECT c.tenant_id FROM clients c WHERE c.id = p.client_id AND c.tenant_id IS NOT NULL),
                  (SELECT w.tenant_id FROM workspaces w WHERE w.id = p.workspace_id AND w.tenant_id IS NOT NULL)
                ) WHERE p.tenant_id IS NULL AND (
                  EXISTS (SELECT 1 FROM clients c WHERE c.id = p.client_id AND c.tenant_id IS NOT NULL)
                  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = p.workspace_id AND w.tenant_id IS NOT NULL)
                )
              `));
              updated = (projectsResult as any).rowCount || 0;
              break;
            case "tasks":
              const tasksResult = await db.execute(sql.raw(`
                UPDATE tasks t SET tenant_id = p.tenant_id
                FROM projects p WHERE t.project_id = p.id
                AND t.tenant_id IS NULL AND p.tenant_id IS NOT NULL
              `));
              updated = (tasksResult as any).rowCount || 0;
              break;
            case "time_entries":
              const timeResult = await db.execute(sql.raw(`
                UPDATE time_entries te SET tenant_id = t.tenant_id
                FROM tasks t WHERE te.task_id = t.id
                AND te.tenant_id IS NULL AND t.tenant_id IS NOT NULL
              `));
              updated = (timeResult as any).rowCount || 0;
              break;
            case "chat_messages":
              const chatMsgResult = await db.execute(sql.raw(`
                UPDATE chat_messages cm SET tenant_id = COALESCE(
                  (SELECT cc.tenant_id FROM chat_channels cc WHERE cc.id = cm.channel_id AND cc.tenant_id IS NOT NULL),
                  (SELECT dt.tenant_id FROM chat_dm_threads dt WHERE dt.id = cm.dm_thread_id AND dt.tenant_id IS NOT NULL)
                ) WHERE cm.tenant_id IS NULL AND (
                  EXISTS (SELECT 1 FROM chat_channels cc WHERE cc.id = cm.channel_id AND cc.tenant_id IS NOT NULL)
                  OR EXISTS (SELECT 1 FROM chat_dm_threads dt WHERE dt.id = cm.dm_thread_id AND dt.tenant_id IS NOT NULL)
                )
              `));
              updated = (chatMsgResult as any).rowCount || 0;
              break;
            case "workspaces":
              details = "Workspaces require manual tenant assignment";
              break;
            default:
              details = "No auto-backfill strategy for this table";
          }
        } else {
          details = "Dry run - no changes applied";
        }

        const remainingResult = await db.execute<{ count: string }>(
          sql.raw(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id IS NULL`)
        );
        const remaining = parseInt(remainingResult.rows[0]?.count || "0", 10);

        results.push({
          table,
          nullBefore,
          updated,
          remaining: dryRun ? nullBefore : remaining,
          details: details || undefined,
        });
      } catch (tableError) {
        results.push({
          table,
          nullBefore: -1,
          updated: 0,
          remaining: -1,
          details: `Error: ${(tableError as Error).message}`,
        });
      }
    }

    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalRemaining = results.reduce((sum, r) => sum + Math.max(0, r.remaining), 0);
    const tablesWithDrift = results.filter(r => r.nullBefore > 0).length;

    res.json({
      success: true,
      mode: dryRun ? "dry-run" : "live",
      summary: {
        tablesChecked: results.length,
        tablesWithDrift,
        totalUpdated,
        totalRemaining,
      },
      results: results.filter(r => r.nullBefore > 0 || r.remaining > 0),
    });
  } catch (error) {
    console.error("[tenancy/backfill] Backfill failed:", error);
    res.status(500).json({ error: "Backfill operation failed", details: (error as Error).message });
  }
});
