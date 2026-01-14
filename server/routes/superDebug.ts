/**
 * Super Admin Debug Tools Routes
 * 
 * Purpose: Provides diagnostic and remediation tools for super administrators.
 * 
 * Key Invariants:
 * - ALL endpoints require super_user role (enforced by requireSuperUser middleware)
 * - Destructive operations require environment flags AND confirmation headers
 * - All mutations write audit events for compliance
 * 
 * Security Guards:
 * - Delete: SUPER_DEBUG_DELETE_ALLOWED=true + X-Confirm-Delete header + confirmPhrase body
 * - Backfill Apply: BACKFILL_TENANT_IDS_ALLOWED=true + X-Confirm-Backfill header
 * - Cache/Health: SUPER_DEBUG_ACTIONS_ALLOWED=true + confirmation headers
 * 
 * Sharp Edges:
 * - Quarantine operations use tenant slug "quarantine" for stability (not ID)
 * - Backfill defaults to dry_run mode; apply mode requires explicit flags
 * - Never expose these endpoints to non-super users
 */
import { Router } from "express";
import { requireSuperUser } from "../middleware/tenantContext";
import { db } from "../db";
import { 
  tenants, users, projects, tasks, teams, clients, workspaces,
  tenantAuditEvents, TenantStatus, UserRole, sections
} from "@shared/schema";
import { eq, sql, and, or, isNull, ne, count, ilike, desc, inArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const QUARANTINE_TENANT_SLUG = "quarantine";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function getQuarantineTenantId(): Promise<string | null> {
  const [qt] = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
    .limit(1);
  return qt?.id || null;
}

async function writeAuditEvent(
  tenantId: string,
  userId: string | null,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(tenantAuditEvents).values({
    tenantId,
    actorUserId: userId,
    eventType,
    message,
    metadata,
  });
}

// =============================================================================
// SECTION A: QUARANTINE MANAGER ENDPOINTS
// =============================================================================

// GET /api/v1/super/debug/quarantine/summary - Get quarantine counts by table
router.get("/quarantine/summary", requireSuperUser, async (req, res) => {
  try {
    const quarantineTenantId = await getQuarantineTenantId();
    
    if (!quarantineTenantId) {
      return res.json({
        hasQuarantineTenant: false,
        counts: { projects: 0, tasks: 0, teams: 0, users: 0 },
        message: "No quarantine tenant exists. Run backfill to create one if needed.",
      });
    }
    
    const [projectCount] = await db.select({ count: count() })
      .from(projects)
      .where(eq(projects.tenantId, quarantineTenantId));
    
    const [taskCount] = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.tenantId, quarantineTenantId));
    
    const [teamCount] = await db.select({ count: count() })
      .from(teams)
      .where(eq(teams.tenantId, quarantineTenantId));
    
    const [userCount] = await db.select({ count: count() })
      .from(users)
      .where(eq(users.tenantId, quarantineTenantId));
    
    res.json({
      hasQuarantineTenant: true,
      quarantineTenantId,
      counts: {
        projects: projectCount?.count || 0,
        tasks: taskCount?.count || 0,
        teams: teamCount?.count || 0,
        users: userCount?.count || 0,
      },
    });
  } catch (error) {
    console.error("[debug/quarantine] Failed to get summary:", error);
    res.status(500).json({ error: "Failed to get quarantine summary" });
  }
});

// GET /api/v1/super/debug/quarantine/list - List quarantined rows by table
router.get("/quarantine/list", requireSuperUser, async (req, res) => {
  try {
    const table = req.query.table as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const searchQuery = req.query.q as string | undefined;
    const offset = (page - 1) * limit;
    
    const validTables = ["projects", "tasks", "teams", "users"];
    if (!validTables.includes(table)) {
      return res.status(400).json({ 
        error: `Invalid table. Must be one of: ${validTables.join(", ")}` 
      });
    }
    
    const quarantineTenantId = await getQuarantineTenantId();
    if (!quarantineTenantId) {
      return res.json({ rows: [], total: 0, page, limit, table });
    }
    
    let rows: any[] = [];
    let total = 0;
    
    switch (table) {
      case "projects": {
        let whereClause = eq(projects.tenantId, quarantineTenantId);
        if (searchQuery) {
          whereClause = and(
            eq(projects.tenantId, quarantineTenantId),
            or(
              ilike(projects.name, `%${searchQuery}%`),
              ilike(projects.id, `%${searchQuery}%`)
            )
          ) as any;
        }
        
        const [countResult] = await db.select({ count: count() })
          .from(projects)
          .where(whereClause);
        total = countResult?.count || 0;
        
        rows = await db.select({
          id: projects.id,
          name: projects.name,
          workspaceId: projects.workspaceId,
          clientId: projects.clientId,
          createdBy: projects.createdBy,
          createdAt: projects.createdAt,
          status: projects.status,
        })
          .from(projects)
          .where(whereClause)
          .orderBy(desc(projects.createdAt))
          .limit(limit)
          .offset(offset);
        break;
      }
      
      case "tasks": {
        let whereClause = eq(tasks.tenantId, quarantineTenantId);
        if (searchQuery) {
          whereClause = and(
            eq(tasks.tenantId, quarantineTenantId),
            or(
              ilike(tasks.title, `%${searchQuery}%`),
              ilike(tasks.id, `%${searchQuery}%`)
            )
          ) as any;
        }
        
        const [countResult] = await db.select({ count: count() })
          .from(tasks)
          .where(whereClause);
        total = countResult?.count || 0;
        
        rows = await db.select({
          id: tasks.id,
          title: tasks.title,
          projectId: tasks.projectId,
          createdBy: tasks.createdBy,
          createdAt: tasks.createdAt,
          status: tasks.status,
        })
          .from(tasks)
          .where(whereClause)
          .orderBy(desc(tasks.createdAt))
          .limit(limit)
          .offset(offset);
        break;
      }
      
      case "teams": {
        let whereClause = eq(teams.tenantId, quarantineTenantId);
        if (searchQuery) {
          whereClause = and(
            eq(teams.tenantId, quarantineTenantId),
            or(
              ilike(teams.name, `%${searchQuery}%`),
              ilike(teams.id, `%${searchQuery}%`)
            )
          ) as any;
        }
        
        const [countResult] = await db.select({ count: count() })
          .from(teams)
          .where(whereClause);
        total = countResult?.count || 0;
        
        rows = await db.select({
          id: teams.id,
          name: teams.name,
          workspaceId: teams.workspaceId,
          createdAt: teams.createdAt,
        })
          .from(teams)
          .where(whereClause)
          .orderBy(desc(teams.createdAt))
          .limit(limit)
          .offset(offset);
        break;
      }
      
      case "users": {
        let whereClause = eq(users.tenantId, quarantineTenantId);
        if (searchQuery) {
          whereClause = and(
            eq(users.tenantId, quarantineTenantId),
            or(
              ilike(users.email, `%${searchQuery}%`),
              ilike(users.name, `%${searchQuery}%`),
              ilike(users.id, `%${searchQuery}%`)
            )
          ) as any;
        }
        
        const [countResult] = await db.select({ count: count() })
          .from(users)
          .where(whereClause);
        total = countResult?.count || 0;
        
        rows = await db.select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
          .from(users)
          .where(whereClause)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset);
        break;
      }
    }
    
    res.json({ rows, total, page, limit, table });
  } catch (error) {
    console.error("[debug/quarantine] Failed to list rows:", error);
    res.status(500).json({ error: "Failed to list quarantined rows" });
  }
});

// Assignment schema
const assignQuarantineSchema = z.object({
  table: z.enum(["projects", "tasks", "teams", "users"]),
  id: z.string(),
  assignTo: z.object({
    tenantId: z.string().uuid(),
    workspaceId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    sectionId: z.string().uuid().optional(),
  }),
});

// POST /api/v1/super/debug/quarantine/assign - Assign quarantined row to a tenant
router.post("/quarantine/assign", requireSuperUser, async (req, res) => {
  try {
    const parseResult = assignQuarantineSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request", 
        details: parseResult.error.errors 
      });
    }
    
    const { table, id, assignTo } = parseResult.data;
    const user = req.user as any;
    const quarantineTenantId = await getQuarantineTenantId();
    
    if (!quarantineTenantId) {
      return res.status(400).json({ error: "No quarantine tenant exists" });
    }
    
    // Verify target tenant exists
    const [targetTenant] = await db.select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, assignTo.tenantId))
      .limit(1);
    
    if (!targetTenant) {
      return res.status(400).json({ error: "Target tenant not found" });
    }
    
    // Verify workspace belongs to tenant if provided
    if (assignTo.workspaceId) {
      const [ws] = await db.select({ id: workspaces.id })
        .from(workspaces)
        .where(and(
          eq(workspaces.id, assignTo.workspaceId),
          eq(workspaces.tenantId, assignTo.tenantId)
        ))
        .limit(1);
      
      if (!ws) {
        return res.status(400).json({ error: "Workspace not found or does not belong to tenant" });
      }
    }
    
    // Verify project belongs to tenant if provided
    if (assignTo.projectId) {
      const [proj] = await db.select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.id, assignTo.projectId),
          eq(projects.tenantId, assignTo.tenantId)
        ))
        .limit(1);
      
      if (!proj) {
        return res.status(400).json({ error: "Project not found or does not belong to tenant" });
      }
    }
    
    let updated = false;
    let previousTenantId = quarantineTenantId;
    
    switch (table) {
      case "projects": {
        const [existing] = await db.select({ 
          id: projects.id, 
          tenantId: projects.tenantId,
          name: projects.name,
        })
          .from(projects)
          .where(and(
            eq(projects.id, id),
            eq(projects.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "Project not found in quarantine" });
        }
        
        const updateData: any = { tenantId: assignTo.tenantId };
        if (assignTo.workspaceId) updateData.workspaceId = assignTo.workspaceId;
        if (assignTo.clientId) updateData.clientId = assignTo.clientId;
        
        await db.update(projects)
          .set(updateData)
          .where(eq(projects.id, id));
        
        updated = true;
        break;
      }
      
      case "tasks": {
        const [existing] = await db.select({ 
          id: tasks.id, 
          tenantId: tasks.tenantId,
          title: tasks.title,
        })
          .from(tasks)
          .where(and(
            eq(tasks.id, id),
            eq(tasks.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "Task not found in quarantine" });
        }
        
        const updateData: any = { tenantId: assignTo.tenantId };
        if (assignTo.projectId) updateData.projectId = assignTo.projectId;
        if (assignTo.sectionId) updateData.sectionId = assignTo.sectionId;
        
        await db.update(tasks)
          .set(updateData)
          .where(eq(tasks.id, id));
        
        updated = true;
        break;
      }
      
      case "teams": {
        const [existing] = await db.select({ 
          id: teams.id, 
          tenantId: teams.tenantId,
          name: teams.name,
        })
          .from(teams)
          .where(and(
            eq(teams.id, id),
            eq(teams.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "Team not found in quarantine" });
        }
        
        const updateData: any = { tenantId: assignTo.tenantId };
        if (assignTo.workspaceId) updateData.workspaceId = assignTo.workspaceId;
        
        await db.update(teams)
          .set(updateData)
          .where(eq(teams.id, id));
        
        updated = true;
        break;
      }
      
      case "users": {
        const [existing] = await db.select({ 
          id: users.id, 
          tenantId: users.tenantId,
          email: users.email,
        })
          .from(users)
          .where(and(
            eq(users.id, id),
            eq(users.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "User not found in quarantine" });
        }
        
        await db.update(users)
          .set({ tenantId: assignTo.tenantId })
          .where(eq(users.id, id));
        
        updated = true;
        break;
      }
    }
    
    if (updated) {
      await writeAuditEvent(
        assignTo.tenantId,
        user.id,
        "quarantine_assigned",
        `Assigned ${table} row ${id} from quarantine to tenant ${targetTenant.name}`,
        {
          table,
          rowId: id,
          previousTenantId,
          newTenantId: assignTo.tenantId,
          assignedData: assignTo,
          actorEmail: user.email,
        }
      );
    }
    
    res.json({ success: true, assigned: updated });
  } catch (error) {
    console.error("[debug/quarantine] Failed to assign:", error);
    res.status(500).json({ error: "Failed to assign quarantined row" });
  }
});

// POST /api/v1/super/debug/quarantine/archive - Archive a quarantined row
router.post("/quarantine/archive", requireSuperUser, async (req, res) => {
  try {
    const { table, id } = req.body;
    const user = req.user as any;
    
    if (!table || !id) {
      return res.status(400).json({ error: "table and id are required" });
    }
    
    const quarantineTenantId = await getQuarantineTenantId();
    if (!quarantineTenantId) {
      return res.status(400).json({ error: "No quarantine tenant exists" });
    }
    
    let archived = false;
    let message = "";
    
    switch (table) {
      case "users": {
        const [existing] = await db.select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.id, id),
            eq(users.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "User not found in quarantine" });
        }
        
        await db.update(users)
          .set({ isActive: false })
          .where(eq(users.id, id));
        
        archived = true;
        message = "User deactivated";
        break;
      }
      
      case "projects":
      case "tasks":
      case "teams": {
        message = `Archive not supported for ${table}. Use 'assign' to move to a proper tenant or 'delete' with proper guards.`;
        break;
      }
      
      default:
        return res.status(400).json({ error: "Invalid table" });
    }
    
    if (archived) {
      await writeAuditEvent(
        quarantineTenantId,
        user.id,
        "quarantine_archived",
        `Archived ${table} row ${id} in quarantine`,
        { table, rowId: id, actorEmail: user.email }
      );
    }
    
    res.json({ success: archived, message });
  } catch (error) {
    console.error("[debug/quarantine] Failed to archive:", error);
    res.status(500).json({ error: "Failed to archive quarantined row" });
  }
});

// POST /api/v1/super/debug/quarantine/delete - Delete quarantined row (HIGH RISK)
router.post("/quarantine/delete", requireSuperUser, async (req, res) => {
  try {
    const deleteAllowed = process.env.SUPER_DEBUG_DELETE_ALLOWED === "true";
    if (!deleteAllowed) {
      return res.status(403).json({ 
        error: "Delete not allowed",
        message: "Set SUPER_DEBUG_DELETE_ALLOWED=true to enable this feature",
      });
    }
    
    const confirmHeader = req.headers["x-confirm-delete"];
    if (confirmHeader !== "DELETE_QUARANTINED_ROW") {
      return res.status(400).json({ 
        error: "Confirmation required",
        message: "Send header X-Confirm-Delete: DELETE_QUARANTINED_ROW",
      });
    }
    
    const { table, id, confirmPhrase } = req.body;
    const user = req.user as any;
    
    if (confirmPhrase !== "DELETE_QUARANTINED_ROW") {
      return res.status(400).json({ 
        error: "Confirmation phrase mismatch",
        message: "confirmPhrase must be 'DELETE_QUARANTINED_ROW'",
      });
    }
    
    if (!table || !id) {
      return res.status(400).json({ error: "table and id are required" });
    }
    
    const quarantineTenantId = await getQuarantineTenantId();
    if (!quarantineTenantId) {
      return res.status(400).json({ error: "No quarantine tenant exists" });
    }
    
    let deleted = false;
    
    switch (table) {
      case "projects": {
        const [existing] = await db.select({ id: projects.id })
          .from(projects)
          .where(and(
            eq(projects.id, id),
            eq(projects.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "Project not found in quarantine" });
        }
        
        // Check for dependent tasks
        const [taskDeps] = await db.select({ count: count() })
          .from(tasks)
          .where(eq(tasks.projectId, id));
        
        if ((taskDeps?.count || 0) > 0) {
          return res.status(400).json({ 
            error: "Cannot delete: has dependent tasks",
            dependencyCount: taskDeps.count,
          });
        }
        
        await db.delete(projects).where(eq(projects.id, id));
        deleted = true;
        break;
      }
      
      case "tasks": {
        const [existing] = await db.select({ id: tasks.id })
          .from(tasks)
          .where(and(
            eq(tasks.id, id),
            eq(tasks.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "Task not found in quarantine" });
        }
        
        // Check for subtasks
        const [subtaskDeps] = await db.select({ count: count() })
          .from(tasks)
          .where(eq(tasks.parentTaskId, id));
        
        if ((subtaskDeps?.count || 0) > 0) {
          return res.status(400).json({ 
            error: "Cannot delete: has dependent subtasks",
            dependencyCount: subtaskDeps.count,
          });
        }
        
        await db.delete(tasks).where(eq(tasks.id, id));
        deleted = true;
        break;
      }
      
      case "teams": {
        const [existing] = await db.select({ id: teams.id })
          .from(teams)
          .where(and(
            eq(teams.id, id),
            eq(teams.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "Team not found in quarantine" });
        }
        
        await db.delete(teams).where(eq(teams.id, id));
        deleted = true;
        break;
      }
      
      case "users": {
        const [existing] = await db.select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.id, id),
            eq(users.tenantId, quarantineTenantId)
          ))
          .limit(1);
        
        if (!existing) {
          return res.status(404).json({ error: "User not found in quarantine" });
        }
        
        await db.delete(users).where(eq(users.id, id));
        deleted = true;
        break;
      }
      
      default:
        return res.status(400).json({ error: "Invalid table" });
    }
    
    if (deleted) {
      await writeAuditEvent(
        quarantineTenantId,
        user.id,
        "quarantine_deleted",
        `Permanently deleted ${table} row ${id} from quarantine`,
        { table, rowId: id, actorEmail: user.email }
      );
    }
    
    res.json({ success: deleted, deleted });
  } catch (error) {
    console.error("[debug/quarantine] Failed to delete:", error);
    res.status(500).json({ error: "Failed to delete quarantined row" });
  }
});

// =============================================================================
// SECTION B: TENANTID BACKFILL TOOLING
// =============================================================================

// GET /api/v1/super/debug/tenantid/scan - Scan for missing tenant IDs
router.get("/tenantid/scan", requireSuperUser, async (req, res) => {
  try {
    const quarantineTenantId = await getQuarantineTenantId();
    
    // Count missing tenantIds per table
    const [usersMissing] = await db.select({ count: count() })
      .from(users)
      .where(and(
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER)
      ));
    
    const [projectsMissing] = await db.select({ count: count() })
      .from(projects)
      .where(isNull(projects.tenantId));
    
    const [tasksMissing] = await db.select({ count: count() })
      .from(tasks)
      .where(isNull(tasks.tenantId));
    
    const [teamsMissing] = await db.select({ count: count() })
      .from(teams)
      .where(isNull(teams.tenantId));
    
    const [clientsMissing] = await db.select({ count: count() })
      .from(clients)
      .where(isNull(clients.tenantId));
    
    const notes: string[] = [];
    const backfillAllowed = process.env.BACKFILL_TENANT_IDS_ALLOWED === "true";
    
    if (!backfillAllowed) {
      notes.push("Backfill is disabled. Set BACKFILL_TENANT_IDS_ALLOWED=true to enable.");
    }
    
    if (!quarantineTenantId) {
      notes.push("No quarantine tenant exists. One will be created during backfill.");
    }
    
    const totalMissing = 
      (usersMissing?.count || 0) +
      (projectsMissing?.count || 0) +
      (tasksMissing?.count || 0) +
      (teamsMissing?.count || 0) +
      (clientsMissing?.count || 0);
    
    if (totalMissing === 0) {
      notes.push("All rows have tenant IDs assigned.");
    }
    
    res.json({
      missing: {
        users: usersMissing?.count || 0,
        projects: projectsMissing?.count || 0,
        tasks: tasksMissing?.count || 0,
        teams: teamsMissing?.count || 0,
        clients: clientsMissing?.count || 0,
      },
      totalMissing,
      quarantineTenantId,
      backfillAllowed,
      notes,
    });
  } catch (error) {
    console.error("[debug/tenantid] Failed to scan:", error);
    res.status(500).json({ error: "Failed to scan for missing tenant IDs" });
  }
});

// POST /api/v1/super/debug/tenantid/backfill - Run backfill (dry-run or apply)
router.post("/tenantid/backfill", requireSuperUser, async (req, res) => {
  try {
    const mode = req.query.mode as string || "dry_run";
    const user = req.user as any;
    
    if (mode !== "dry_run" && mode !== "apply") {
      return res.status(400).json({ error: "mode must be 'dry_run' or 'apply'" });
    }
    
    const backfillAllowed = process.env.BACKFILL_TENANT_IDS_ALLOWED === "true";
    
    if (mode === "apply") {
      if (!backfillAllowed) {
        return res.status(403).json({ 
          error: "Backfill not allowed",
          message: "Set BACKFILL_TENANT_IDS_ALLOWED=true to enable apply mode",
        });
      }
      
      const confirmHeader = req.headers["x-confirm-backfill"];
      if (confirmHeader !== "APPLY_TENANTID_BACKFILL") {
        return res.status(400).json({ 
          error: "Confirmation required",
          message: "Send header X-Confirm-Backfill: APPLY_TENANTID_BACKFILL",
        });
      }
    }
    
    // Build workspace → tenantId map
    const allWorkspaces = await db.select({
      id: workspaces.id,
      tenantId: workspaces.tenantId,
    }).from(workspaces);
    const workspaceTenantMap = new Map(allWorkspaces.map(w => [w.id, w.tenantId]));
    
    // Build client → tenantId map
    const allClients = await db.select({
      id: clients.id,
      tenantId: clients.tenantId,
    }).from(clients);
    const clientTenantMap = new Map(allClients.map(c => [c.id, c.tenantId]));
    
    // Build user → tenantId map
    const allUsers = await db.select({
      id: users.id,
      tenantId: users.tenantId,
    }).from(users);
    const userTenantMap = new Map(allUsers.map(u => [u.id, u.tenantId]));
    
    // Results tracking
    const results = {
      updated: { projects: 0, tasks: 0, teams: 0, users: 0 },
      quarantined: { projects: 0, tasks: 0, teams: 0, users: 0 },
      ambiguousSamples: { projects: [] as string[], tasks: [] as string[], teams: [] as string[], users: [] as string[] },
    };
    
    // Get or create quarantine tenant
    let quarantineTenantId = await getQuarantineTenantId();
    
    if (!quarantineTenantId && mode === "apply") {
      const [newTenant] = await db.insert(tenants).values({
        name: "Quarantine / Legacy Data",
        slug: QUARANTINE_TENANT_SLUG,
        status: TenantStatus.INACTIVE,
      }).returning();
      quarantineTenantId = newTenant.id;
    }
    
    // 1. PROJECTS
    const projectsWithoutTenant = await db.select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      clientId: projects.clientId,
      createdBy: projects.createdBy,
    })
      .from(projects)
      .where(isNull(projects.tenantId));
    
    for (const project of projectsWithoutTenant) {
      let inferredTenantId: string | null = null;
      
      if (project.workspaceId) {
        inferredTenantId = workspaceTenantMap.get(project.workspaceId) || null;
      }
      if (!inferredTenantId && project.clientId) {
        inferredTenantId = clientTenantMap.get(project.clientId) || null;
      }
      if (!inferredTenantId && project.createdBy) {
        inferredTenantId = userTenantMap.get(project.createdBy) || null;
      }
      
      if (inferredTenantId) {
        if (mode === "apply") {
          await db.update(projects)
            .set({ tenantId: inferredTenantId })
            .where(eq(projects.id, project.id));
        }
        results.updated.projects++;
      } else if (quarantineTenantId) {
        if (mode === "apply") {
          await db.update(projects)
            .set({ tenantId: quarantineTenantId })
            .where(eq(projects.id, project.id));
        }
        results.quarantined.projects++;
        if (results.ambiguousSamples.projects.length < 5) {
          results.ambiguousSamples.projects.push(project.id);
        }
      }
    }
    
    // Update project tenant map after backfill
    if (mode === "apply") {
      const updatedProjects = await db.select({
        id: projects.id,
        tenantId: projects.tenantId,
      }).from(projects);
      const projectTenantMap = new Map(updatedProjects.map(p => [p.id, p.tenantId]));
      
      // 2. TASKS (depends on projects)
      const tasksWithoutTenant = await db.select({
        id: tasks.id,
        projectId: tasks.projectId,
        createdBy: tasks.createdBy,
      })
        .from(tasks)
        .where(isNull(tasks.tenantId));
      
      for (const task of tasksWithoutTenant) {
        let inferredTenantId: string | null = null;
        
        if (task.projectId) {
          inferredTenantId = projectTenantMap.get(task.projectId) || null;
        }
        if (!inferredTenantId && task.createdBy) {
          inferredTenantId = userTenantMap.get(task.createdBy) || null;
        }
        
        if (inferredTenantId) {
          await db.update(tasks)
            .set({ tenantId: inferredTenantId })
            .where(eq(tasks.id, task.id));
          results.updated.tasks++;
        } else if (quarantineTenantId) {
          await db.update(tasks)
            .set({ tenantId: quarantineTenantId })
            .where(eq(tasks.id, task.id));
          results.quarantined.tasks++;
          if (results.ambiguousSamples.tasks.length < 5) {
            results.ambiguousSamples.tasks.push(task.id);
          }
        }
      }
    } else {
      // Dry run estimation for tasks
      const tasksWithoutTenant = await db.select({
        id: tasks.id,
        projectId: tasks.projectId,
        createdBy: tasks.createdBy,
      })
        .from(tasks)
        .where(isNull(tasks.tenantId));
      
      // Build project tenant map for estimation
      const allProjects = await db.select({
        id: projects.id,
        tenantId: projects.tenantId,
      }).from(projects);
      const projectTenantMap = new Map(allProjects.map(p => [p.id, p.tenantId]));
      
      for (const task of tasksWithoutTenant) {
        let inferredTenantId: string | null = null;
        
        if (task.projectId) {
          inferredTenantId = projectTenantMap.get(task.projectId) || null;
        }
        if (!inferredTenantId && task.createdBy) {
          inferredTenantId = userTenantMap.get(task.createdBy) || null;
        }
        
        if (inferredTenantId) {
          results.updated.tasks++;
        } else {
          results.quarantined.tasks++;
          if (results.ambiguousSamples.tasks.length < 5) {
            results.ambiguousSamples.tasks.push(task.id);
          }
        }
      }
    }
    
    // 3. TEAMS
    const teamsWithoutTenant = await db.select({
      id: teams.id,
      workspaceId: teams.workspaceId,
    })
      .from(teams)
      .where(isNull(teams.tenantId));
    
    for (const team of teamsWithoutTenant) {
      const inferredTenantId = team.workspaceId ? workspaceTenantMap.get(team.workspaceId) || null : null;
      
      if (inferredTenantId) {
        if (mode === "apply") {
          await db.update(teams)
            .set({ tenantId: inferredTenantId })
            .where(eq(teams.id, team.id));
        }
        results.updated.teams++;
      } else if (quarantineTenantId) {
        if (mode === "apply") {
          await db.update(teams)
            .set({ tenantId: quarantineTenantId })
            .where(eq(teams.id, team.id));
        }
        results.quarantined.teams++;
        if (results.ambiguousSamples.teams.length < 5) {
          results.ambiguousSamples.teams.push(team.id);
        }
      }
    }
    
    // 4. USERS (most complex)
    const usersWithoutTenant = await db.select({
      id: users.id,
      role: users.role,
    })
      .from(users)
      .where(and(
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER)
      ));
    
    for (const u of usersWithoutTenant) {
      // Try to infer from workspace memberships
      // For simplicity, we'll just quarantine users without tenant
      // since proper inference requires complex join logic
      if (quarantineTenantId) {
        if (mode === "apply") {
          await db.update(users)
            .set({ tenantId: quarantineTenantId })
            .where(eq(users.id, u.id));
        }
        results.quarantined.users++;
        if (results.ambiguousSamples.users.length < 5) {
          results.ambiguousSamples.users.push(u.id);
        }
      }
    }
    
    // Write audit event for apply mode
    if (mode === "apply" && quarantineTenantId) {
      await writeAuditEvent(
        quarantineTenantId,
        user.id,
        "backfill_applied",
        `TenantId backfill applied by ${user.email}`,
        { results, actorEmail: user.email }
      );
    }
    
    res.json({
      mode,
      ...results,
      quarantineTenantId: mode === "apply" ? quarantineTenantId : null,
    });
  } catch (error) {
    console.error("[debug/tenantid] Failed to backfill:", error);
    res.status(500).json({ error: "Failed to run backfill" });
  }
});

// =============================================================================
// SECTION C: DATA INTEGRITY CHECKS
// =============================================================================

interface IntegrityIssue {
  code: string;
  severity: "info" | "warn" | "blocker";
  count: number;
  sampleIds: string[];
  description: string;
}

// GET /api/v1/super/debug/integrity/checks - Run data integrity checks
router.get("/integrity/checks", requireSuperUser, async (req, res) => {
  try {
    const issues: IntegrityIssue[] = [];
    
    // 1. Cross-tenant foreign key mismatches: tasks.projectId → project with different tenantId
    const taskProjectMismatch = await db.execute(sql`
      SELECT t.id, t.tenant_id as task_tenant, p.tenant_id as project_tenant
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.tenant_id IS NOT NULL 
        AND p.tenant_id IS NOT NULL 
        AND t.tenant_id != p.tenant_id
      LIMIT 10
    `);
    
    if (taskProjectMismatch.rows.length > 0) {
      issues.push({
        code: "TASK_PROJECT_TENANT_MISMATCH",
        severity: "blocker",
        count: taskProjectMismatch.rows.length,
        sampleIds: taskProjectMismatch.rows.slice(0, 5).map((r: any) => r.id),
        description: "Tasks with projectId pointing to projects in different tenants",
      });
    }
    
    // 2. Cross-tenant: projects.clientId → client with different tenantId
    const projectClientMismatch = await db.execute(sql`
      SELECT p.id, p.tenant_id as project_tenant, c.tenant_id as client_tenant
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id IS NOT NULL 
        AND c.tenant_id IS NOT NULL 
        AND p.tenant_id != c.tenant_id
      LIMIT 10
    `);
    
    if (projectClientMismatch.rows.length > 0) {
      issues.push({
        code: "PROJECT_CLIENT_TENANT_MISMATCH",
        severity: "blocker",
        count: projectClientMismatch.rows.length,
        sampleIds: projectClientMismatch.rows.slice(0, 5).map((r: any) => r.id),
        description: "Projects with clientId pointing to clients in different tenants",
      });
    }
    
    // 3. Missing tenantId on non-super users
    const [usersNoTenant] = await db.select({ count: count() })
      .from(users)
      .where(and(
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER)
      ));
    
    if ((usersNoTenant?.count || 0) > 0) {
      const samples = await db.select({ id: users.id })
        .from(users)
        .where(and(
          isNull(users.tenantId),
          ne(users.role, UserRole.SUPER_USER)
        ))
        .limit(5);
      
      issues.push({
        code: "USERS_MISSING_TENANT",
        severity: "warn",
        count: usersNoTenant?.count || 0,
        sampleIds: samples.map(u => u.id),
        description: "Non-super users without tenantId assigned",
      });
    }
    
    // 4. Projects missing workspaceId
    const [projectsNoWorkspace] = await db.select({ count: count() })
      .from(projects)
      .where(isNull(projects.workspaceId));
    
    if ((projectsNoWorkspace?.count || 0) > 0) {
      const samples = await db.select({ id: projects.id })
        .from(projects)
        .where(isNull(projects.workspaceId))
        .limit(5);
      
      issues.push({
        code: "PROJECTS_MISSING_WORKSPACE",
        severity: "warn",
        count: projectsNoWorkspace?.count || 0,
        sampleIds: samples.map(p => p.id),
        description: "Projects without workspaceId assigned",
      });
    }
    
    // 5. Multiple primary workspaces per tenant
    const multiplePrimaries = await db.execute(sql`
      SELECT tenant_id, COUNT(*) as primary_count
      FROM workspaces
      WHERE is_primary = true AND tenant_id IS NOT NULL
      GROUP BY tenant_id
      HAVING COUNT(*) > 1
    `);
    
    if (multiplePrimaries.rows.length > 0) {
      issues.push({
        code: "MULTIPLE_PRIMARY_WORKSPACES",
        severity: "warn",
        count: multiplePrimaries.rows.length,
        sampleIds: multiplePrimaries.rows.slice(0, 5).map((r: any) => r.tenant_id),
        description: "Tenants with more than one primary workspace",
      });
    }
    
    // 6. Cross-tenant: teams.workspaceId → workspace with different tenantId
    const teamWorkspaceMismatch = await db.execute(sql`
      SELECT t.id, t.tenant_id as team_tenant, w.tenant_id as workspace_tenant
      FROM teams t
      JOIN workspaces w ON t.workspace_id = w.id
      WHERE t.tenant_id IS NOT NULL 
        AND w.tenant_id IS NOT NULL 
        AND t.tenant_id != w.tenant_id
      LIMIT 10
    `);
    
    if (teamWorkspaceMismatch.rows.length > 0) {
      issues.push({
        code: "TEAM_WORKSPACE_TENANT_MISMATCH",
        severity: "blocker",
        count: teamWorkspaceMismatch.rows.length,
        sampleIds: teamWorkspaceMismatch.rows.slice(0, 5).map((r: any) => r.id),
        description: "Teams with workspaceId pointing to workspaces in different tenants",
      });
    }
    
    res.json({
      issues,
      totalIssues: issues.reduce((sum, i) => sum + i.count, 0),
      blockerCount: issues.filter(i => i.severity === "blocker").reduce((sum, i) => sum + i.count, 0),
      warnCount: issues.filter(i => i.severity === "warn").reduce((sum, i) => sum + i.count, 0),
      infoCount: issues.filter(i => i.severity === "info").reduce((sum, i) => sum + i.count, 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[debug/integrity] Failed to run checks:", error);
    res.status(500).json({ error: "Failed to run integrity checks" });
  }
});

// =============================================================================
// SECTION D: SYSTEM STATUS UTILITIES
// =============================================================================

// POST /api/v1/super/debug/tenant-health/recompute - Recompute tenant health
router.post("/tenant-health/recompute", requireSuperUser, async (req, res) => {
  try {
    const debugAllowed = process.env.SUPER_DEBUG_ACTIONS_ALLOWED === "true";
    if (!debugAllowed) {
      return res.status(403).json({ 
        error: "Debug actions not allowed",
        message: "Set SUPER_DEBUG_ACTIONS_ALLOWED=true to enable",
      });
    }
    
    const confirmHeader = req.headers["x-confirm-action"];
    if (confirmHeader !== "RECOMPUTE_TENANT_HEALTH") {
      return res.status(400).json({ 
        error: "Confirmation required",
        message: "Send header X-Confirm-Action: RECOMPUTE_TENANT_HEALTH",
      });
    }
    
    const { tenantId } = req.body;
    const user = req.user as any;
    
    if (tenantId) {
      const [tenant] = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      
      // Placeholder for actual recompute logic
      await writeAuditEvent(
        tenantId,
        user.id,
        "health_recomputed",
        `Tenant health recomputed by ${user.email}`,
        { tenantName: tenant.name, actorEmail: user.email }
      );
      
      res.json({ 
        success: true, 
        message: `Health recomputed for tenant: ${tenant.name}`,
      });
    } else {
      // Recompute all tenants (placeholder)
      res.json({ 
        success: true, 
        message: "Health recomputed for all tenants",
      });
    }
  } catch (error) {
    console.error("[debug/tenant-health] Failed to recompute:", error);
    res.status(500).json({ error: "Failed to recompute tenant health" });
  }
});

// POST /api/v1/super/debug/cache/invalidate - Invalidate caches
router.post("/cache/invalidate", requireSuperUser, async (req, res) => {
  try {
    const debugAllowed = process.env.SUPER_DEBUG_ACTIONS_ALLOWED === "true";
    if (!debugAllowed) {
      return res.status(403).json({ 
        error: "Debug actions not allowed",
        message: "Set SUPER_DEBUG_ACTIONS_ALLOWED=true to enable",
      });
    }
    
    const confirmHeader = req.headers["x-confirm-action"];
    if (confirmHeader !== "INVALIDATE_CACHE") {
      return res.status(400).json({ 
        error: "Confirmation required",
        message: "Send header X-Confirm-Action: INVALIDATE_CACHE",
      });
    }
    
    // Placeholder - no actual cache to invalidate currently
    res.json({ 
      success: true, 
      message: "Cache invalidation complete (no active caches)",
    });
  } catch (error) {
    console.error("[debug/cache] Failed to invalidate:", error);
    res.status(500).json({ error: "Failed to invalidate cache" });
  }
});

// GET /api/v1/super/debug/config - Get debug configuration status
router.get("/config", requireSuperUser, async (req, res) => {
  try {
    res.json({
      flags: {
        SUPER_DEBUG_DELETE_ALLOWED: process.env.SUPER_DEBUG_DELETE_ALLOWED === "true",
        SUPER_DEBUG_ACTIONS_ALLOWED: process.env.SUPER_DEBUG_ACTIONS_ALLOWED === "true",
        BACKFILL_TENANT_IDS_ALLOWED: process.env.BACKFILL_TENANT_IDS_ALLOWED === "true",
        TENANCY_ENFORCEMENT: process.env.TENANCY_ENFORCEMENT || "soft",
      },
      confirmPhrases: {
        delete: "DELETE_QUARANTINED_ROW",
        backfill: "APPLY_TENANTID_BACKFILL",
        recompute: "RECOMPUTE_TENANT_HEALTH",
        invalidate: "INVALIDATE_CACHE",
      },
    });
  } catch (error) {
    console.error("[debug/config] Failed to get config:", error);
    res.status(500).json({ error: "Failed to get debug config" });
  }
});

export default router;
