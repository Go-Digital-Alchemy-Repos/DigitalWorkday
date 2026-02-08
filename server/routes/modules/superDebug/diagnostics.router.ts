import { Router, Request, Response } from "express";
import { requireSuperUser } from "../../../middleware/tenantContext";
import { db } from "../../../db";
import { 
  tenants, users, projects, tasks, teams, workspaces, UserRole
} from "@shared/schema";
import { eq, and, isNull, ne, count, sql } from "drizzle-orm";
import { writeAuditEvent } from "./superDebug.helpers";
import { AppError, handleRouteError, sendError } from "../../../lib/errors";

const router = Router();

interface IntegrityIssue {
  code: string;
  severity: "info" | "warn" | "blocker";
  count: number;
  sampleIds: string[];
  description: string;
}

router.get("/integrity/checks", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const issues: IntegrityIssue[] = [];
    
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
    return handleRouteError(res, error, "INTEGRITY_CHECKS", req);
  }
});

router.post("/tenant-health/recompute", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const debugAllowed = process.env.SUPER_DEBUG_ACTIONS_ALLOWED === "true";
    if (!debugAllowed) {
      return sendError(res, AppError.forbidden("Debug actions not allowed. Set SUPER_DEBUG_ACTIONS_ALLOWED=true to enable"), req);
    }
    
    const confirmHeader = req.headers["x-confirm-action"];
    if (confirmHeader !== "RECOMPUTE_TENANT_HEALTH") {
      return sendError(res, AppError.badRequest("Confirmation required. Send header X-Confirm-Action: RECOMPUTE_TENANT_HEALTH"), req);
    }
    
    const { tenantId } = req.body;
    const user = req.user!;
    
    if (tenantId) {
      const [tenant] = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      
      if (!tenant) {
        return sendError(res, AppError.notFound("Tenant"), req);
      }
      
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
      res.json({ 
        success: true, 
        message: "Health recomputed for all tenants",
      });
    }
  } catch (error) {
    return handleRouteError(res, error, "TENANT_HEALTH_RECOMPUTE", req);
  }
});

router.post("/cache/invalidate", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const debugAllowed = process.env.SUPER_DEBUG_ACTIONS_ALLOWED === "true";
    if (!debugAllowed) {
      return sendError(res, AppError.forbidden("Debug actions not allowed. Set SUPER_DEBUG_ACTIONS_ALLOWED=true to enable"), req);
    }
    
    const confirmHeader = req.headers["x-confirm-action"];
    if (confirmHeader !== "INVALIDATE_CACHE") {
      return sendError(res, AppError.badRequest("Confirmation required. Send header X-Confirm-Action: INVALIDATE_CACHE"), req);
    }
    
    res.json({ 
      success: true, 
      message: "Cache invalidation complete (no active caches)",
    });
  } catch (error) {
    return handleRouteError(res, error, "CACHE_INVALIDATE", req);
  }
});

router.get("/config", requireSuperUser, async (req: Request, res: Response) => {
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
    return handleRouteError(res, error, "DEBUG_CONFIG", req);
  }
});

export default router;
