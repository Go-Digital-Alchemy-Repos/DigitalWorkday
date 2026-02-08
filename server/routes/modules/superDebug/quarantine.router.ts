import { Router, Request, Response } from "express";
import { requireSuperUser } from "../../../middleware/tenantContext";
import { db } from "../../../db";
import { 
  tenants, users, projects, tasks, teams, workspaces, sections
} from "@shared/schema";
import { eq, and, or, count, ilike, desc } from "drizzle-orm";
import { z } from "zod";
import { getQuarantineTenantId, writeAuditEvent } from "./superDebug.helpers";
import { AppError, handleRouteError, sendError, validateBody } from "../../../lib/errors";

const router = Router();

router.get("/quarantine/summary", requireSuperUser, async (req: Request, res: Response) => {
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
    return handleRouteError(res, error, "QUARANTINE_SUMMARY", req);
  }
});

router.get("/quarantine/list", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const table = req.query.table as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const searchQuery = req.query.q as string | undefined;
    const offset = (page - 1) * limit;
    
    const validTables = ["projects", "tasks", "teams", "users"];
    if (!validTables.includes(table)) {
      return sendError(res, AppError.badRequest(`Invalid table. Must be one of: ${validTables.join(", ")}`), req);
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
    return handleRouteError(res, error, "QUARANTINE_LIST", req);
  }
});

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

router.post("/quarantine/assign", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const data = validateBody(req.body, assignQuarantineSchema, res, req);
    if (!data) return;
    
    const { table, id, assignTo } = data;
    const user = req.user!;
    const quarantineTenantId = await getQuarantineTenantId();
    
    if (!quarantineTenantId) {
      return sendError(res, AppError.badRequest("No quarantine tenant exists"), req);
    }
    
    const [targetTenant] = await db.select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, assignTo.tenantId))
      .limit(1);
    
    if (!targetTenant) {
      return sendError(res, AppError.badRequest("Target tenant not found"), req);
    }
    
    if (assignTo.workspaceId) {
      const { workspaces } = await import("@shared/schema");
      const [ws] = await db.select({ id: workspaces.id })
        .from(workspaces)
        .where(and(
          eq(workspaces.id, assignTo.workspaceId),
          eq(workspaces.tenantId, assignTo.tenantId)
        ))
        .limit(1);
      
      if (!ws) {
        return sendError(res, AppError.badRequest("Workspace not found or does not belong to tenant"), req);
      }
    }
    
    if (assignTo.projectId) {
      const [proj] = await db.select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.id, assignTo.projectId),
          eq(projects.tenantId, assignTo.tenantId)
        ))
        .limit(1);
      
      if (!proj) {
        return sendError(res, AppError.badRequest("Project not found or does not belong to tenant"), req);
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
          return sendError(res, AppError.notFound("Project not found in quarantine"), req);
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
          return sendError(res, AppError.notFound("Task not found in quarantine"), req);
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
          return sendError(res, AppError.notFound("Team not found in quarantine"), req);
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
          return sendError(res, AppError.notFound("User not found in quarantine"), req);
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
    return handleRouteError(res, error, "QUARANTINE_ASSIGN", req);
  }
});

router.post("/quarantine/archive", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const { table, id } = req.body;
    const user = req.user!;
    
    if (!table || !id) {
      return sendError(res, AppError.badRequest("table and id are required"), req);
    }
    
    const quarantineTenantId = await getQuarantineTenantId();
    if (!quarantineTenantId) {
      return sendError(res, AppError.badRequest("No quarantine tenant exists"), req);
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
          return sendError(res, AppError.notFound("User not found in quarantine"), req);
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
        return sendError(res, AppError.badRequest("Invalid table"), req);
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
    return handleRouteError(res, error, "QUARANTINE_ARCHIVE", req);
  }
});

router.post("/quarantine/delete", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const deleteAllowed = process.env.SUPER_DEBUG_DELETE_ALLOWED === "true";
    if (!deleteAllowed) {
      return sendError(res, AppError.forbidden("Delete not allowed. Set SUPER_DEBUG_DELETE_ALLOWED=true to enable this feature"), req);
    }
    
    const confirmHeader = req.headers["x-confirm-delete"];
    if (confirmHeader !== "DELETE_QUARANTINED_ROW") {
      return sendError(res, AppError.badRequest("Confirmation required. Send header X-Confirm-Delete: DELETE_QUARANTINED_ROW"), req);
    }
    
    const { table, id, confirmPhrase } = req.body;
    const user = req.user!;
    
    if (confirmPhrase !== "DELETE_QUARANTINED_ROW") {
      return sendError(res, AppError.badRequest("Confirmation phrase mismatch. confirmPhrase must be 'DELETE_QUARANTINED_ROW'"), req);
    }
    
    if (!table || !id) {
      return sendError(res, AppError.badRequest("table and id are required"), req);
    }
    
    const quarantineTenantId = await getQuarantineTenantId();
    if (!quarantineTenantId) {
      return sendError(res, AppError.badRequest("No quarantine tenant exists"), req);
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
          return sendError(res, AppError.notFound("Project not found in quarantine"), req);
        }
        
        const [taskDeps] = await db.select({ count: count() })
          .from(tasks)
          .where(eq(tasks.projectId, id));
        
        if ((taskDeps?.count || 0) > 0) {
          return sendError(res, AppError.badRequest("Cannot delete: has dependent tasks"), req);
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
          return sendError(res, AppError.notFound("Task not found in quarantine"), req);
        }
        
        const [subtaskDeps] = await db.select({ count: count() })
          .from(tasks)
          .where(eq(tasks.parentTaskId, id));
        
        if ((subtaskDeps?.count || 0) > 0) {
          return sendError(res, AppError.badRequest("Cannot delete: has dependent subtasks"), req);
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
          return sendError(res, AppError.notFound("Team not found in quarantine"), req);
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
          return sendError(res, AppError.notFound("User not found in quarantine"), req);
        }
        
        await db.delete(users).where(eq(users.id, id));
        deleted = true;
        break;
      }
      
      default:
        return sendError(res, AppError.badRequest("Invalid table"), req);
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
    return handleRouteError(res, error, "QUARANTINE_DELETE", req);
  }
});

export default router;
