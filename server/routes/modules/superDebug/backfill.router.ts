import { Router, Request, Response } from "express";
import { requireSuperUser } from "../../../middleware/tenantContext";
import { db } from "../../../db";
import { 
  tenants, users, projects, tasks, teams, clients, workspaces,
  TenantStatus, UserRole
} from "@shared/schema";
import { eq, and, isNull, ne, count } from "drizzle-orm";
import { getQuarantineTenantId, writeAuditEvent, QUARANTINE_TENANT_SLUG } from "./superDebug.helpers";
import { AppError, handleRouteError, sendError } from "../../../lib/errors";

const router = Router();

router.get("/tenantid/scan", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const quarantineTenantId = await getQuarantineTenantId();
    
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
    return handleRouteError(res, error, "BACKFILL_SCAN", req);
  }
});

router.post("/tenantid/backfill", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const mode = req.query.mode as string || "dry_run";
    const user = req.user!;
    
    if (mode !== "dry_run" && mode !== "apply") {
      return sendError(res, AppError.badRequest("mode must be 'dry_run' or 'apply'"), req);
    }
    
    const backfillAllowed = process.env.BACKFILL_TENANT_IDS_ALLOWED === "true";
    
    if (mode === "apply") {
      if (!backfillAllowed) {
        return sendError(res, AppError.forbidden("Backfill not allowed. Set BACKFILL_TENANT_IDS_ALLOWED=true to enable apply mode"), req);
      }
      
      const confirmHeader = req.headers["x-confirm-backfill"];
      if (confirmHeader !== "APPLY_TENANTID_BACKFILL") {
        return sendError(res, AppError.badRequest("Confirmation required. Send header X-Confirm-Backfill: APPLY_TENANTID_BACKFILL"), req);
      }
    }
    
    const allWorkspaces = await db.select({
      id: workspaces.id,
      tenantId: workspaces.tenantId,
    }).from(workspaces);
    const workspaceTenantMap = new Map(allWorkspaces.map(w => [w.id, w.tenantId]));
    
    const allClients = await db.select({
      id: clients.id,
      tenantId: clients.tenantId,
    }).from(clients);
    const clientTenantMap = new Map(allClients.map(c => [c.id, c.tenantId]));
    
    const allUsers = await db.select({
      id: users.id,
      tenantId: users.tenantId,
    }).from(users);
    const userTenantMap = new Map(allUsers.map(u => [u.id, u.tenantId]));
    
    const results = {
      updated: { projects: 0, tasks: 0, teams: 0, users: 0 },
      quarantined: { projects: 0, tasks: 0, teams: 0, users: 0 },
      ambiguousSamples: { projects: [] as string[], tasks: [] as string[], teams: [] as string[], users: [] as string[] },
    };
    
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
    
    // 2. TASKS (depends on projects for tenant inference)
    if (mode === "apply") {
      const updatedProjects = await db.select({
        id: projects.id,
        tenantId: projects.tenantId,
      }).from(projects);
      const projectTenantMap = new Map(updatedProjects.map(p => [p.id, p.tenantId]));
      
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
      const tasksWithoutTenant = await db.select({
        id: tasks.id,
        projectId: tasks.projectId,
        createdBy: tasks.createdBy,
      })
        .from(tasks)
        .where(isNull(tasks.tenantId));
      
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
    
    // 4. USERS
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
    return handleRouteError(res, error, "BACKFILL_APPLY", req);
  }
});

export default router;
