import { Request, Response } from "express";
import { createApiRouter } from "../http/routerFactory";
import { z } from "zod";
import { db } from "../db";
import { eq, and, desc, sql, count, ilike, lte, gte, inArray, isNotNull } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { requireAuth, requireAdmin } from "../auth";
import {
  clients,
  clientCrm,
  clientFiles,
  userClientAccess,
  users,
  projects,
  tasks,
  timeEntries,
  activityLog,
  comments,
  clientConversations,
  clientMessages,
  updateClientCrmSchema,
  UserRole,
  CrmClientStatus,
} from "@shared/schema";
import { getCurrentUserId } from "./helpers";
import { verifyClientTenancy, isAdminOrSuper } from "./modules/crm/crm.helpers";

import crmSubModules from "./modules/crm";

const router = createApiRouter({ policy: "authTenant" });

router.use(crmSubModules);

// =============================================================================
// CLIENT SUMMARY & METRICS
// =============================================================================

router.get("/crm/clients/:clientId/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const [crmData] = await db.select().from(clientCrm)
      .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
      .limit(1);

    const [projectCount] = await db.select({ value: count() }).from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const clientProjectIds = db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const [taskCount] = await db.select({ value: count() }).from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), sql`${tasks.projectId} IN (${clientProjectIds})`));

    const [completedTaskCount] = await db.select({ value: count() }).from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.status, "completed"), sql`${tasks.projectId} IN (${clientProjectIds})`));

    let ownerName = null;
    if (crmData?.ownerUserId) {
      const [owner] = await db.select({ name: users.name }).from(users)
        .where(eq(users.id, crmData.ownerUserId)).limit(1);
      ownerName = owner?.name || null;
    }

    const totalHoursResult = await db.select({
      totalSeconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`,
    }).from(timeEntries)
      .where(and(
        eq(timeEntries.tenantId, tenantId),
        sql`${timeEntries.projectId} IN (${clientProjectIds})`
      ));

    const totalSeconds = Number(totalHoursResult[0]?.totalSeconds || 0);
    const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;

    const billableHours = 0;

    const allTaskCount = Number(taskCount?.value || 0);
    const doneCount = Number(completedTaskCount?.value || 0);

    const crmResponse = crmData || {
      clientId,
      tenantId,
      status: client.status || "active",
      ownerUserId: null,
      tags: null,
      lastContactAt: null,
      nextFollowUpAt: null,
      followUpNotes: null,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };

    res.json({
      client,
      crm: crmResponse,
      ownerName,
      counts: {
        projects: Number(projectCount?.value || 0),
        openTasks: allTaskCount - doneCount,
        totalHours,
        billableHours,
      },
      stats: {
        projectCount: projectCount?.value || 0,
        taskCount: taskCount?.value || 0,
        completedTaskCount: completedTaskCount?.value || 0,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/summary", req);
  }
});

router.get("/crm/clients/:clientId/metrics", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const clientProjectIds = db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const [totalTasks] = await db.select({ value: count() }).from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), sql`${tasks.projectId} IN (${clientProjectIds})`));

    const [completedTasks] = await db.select({ value: count() }).from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.status, "completed"), sql`${tasks.projectId} IN (${clientProjectIds})`));

    const [overdueTasks] = await db.select({ value: count() }).from(tasks)
      .where(and(
        eq(tasks.tenantId, tenantId),
        sql`${tasks.projectId} IN (${clientProjectIds})`,
        sql`${tasks.dueDate} < NOW()`,
        sql`${tasks.status} != 'completed'`
      ));

    const totalHoursResult = await db.select({
      totalSeconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`,
    })
      .from(timeEntries)
      .where(and(eq(timeEntries.tenantId, tenantId), sql`${timeEntries.projectId} IN (${clientProjectIds})`));

    const totalSeconds = totalHoursResult[0]?.totalSeconds || 0;
    const totalHours = Math.round((Number(totalSeconds) / 3600) * 10) / 10;

    const billableHours = 0;

    const projectStats = await db.select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
    })
      .from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const activeProjects = projectStats.filter(p => p.status === "active").length;
    const completedProjects = projectStats.filter(p => p.status === "completed").length;

    const recentActivity = await db.select({
      id: activityLog.id,
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      description: activityLog.description,
      actorUserId: activityLog.actorUserId,
      createdAt: activityLog.createdAt,
    })
      .from(activityLog)
      .where(
        and(
          sql`${activityLog.workspaceId} IN (SELECT id FROM workspaces WHERE tenant_id = ${tenantId})`,
          sql`${activityLog.entityId} IN (${clientProjectIds}) OR ${activityLog.entityId} IN (SELECT id FROM tasks WHERE tenant_id = ${tenantId} AND project_id IN (${clientProjectIds}))`
        )
      )
      .orderBy(desc(activityLog.createdAt))
      .limit(10);

    res.json({
      tasks: {
        total: totalTasks?.value || 0,
        completed: completedTasks?.value || 0,
        overdue: overdueTasks?.value || 0,
        completionRate: totalTasks?.value ? Math.round(((completedTasks?.value || 0) / (totalTasks?.value || 1)) * 100) : 0,
      },
      hours: {
        total: totalHours,
        billable: billableHours,
      },
      projects: {
        total: projectStats.length,
        active: activeProjects,
        completed: completedProjects,
      },
      recentActivity,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/metrics", req);
  }
});

// =============================================================================
// CRM STATUS UPDATE
// =============================================================================

router.patch("/crm/clients/:clientId/crm", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const data = validateBody(req.body, updateClientCrmSchema, res);
    if (!data) return;

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.ownerUserId !== undefined) updateValues.ownerUserId = data.ownerUserId;
    if (data.tags !== undefined) updateValues.tags = data.tags;
    if (data.followUpNotes !== undefined) updateValues.followUpNotes = data.followUpNotes;
    if (data.lastContactAt !== undefined) {
      updateValues.lastContactAt = data.lastContactAt ? new Date(data.lastContactAt) : null;
    }
    if (data.nextFollowUpAt !== undefined) {
      updateValues.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
    }

    const [existingCrm] = await db.select()
      .from(clientCrm)
      .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
      .limit(1);

    let result;
    if (existingCrm) {
      [result] = await db.update(clientCrm)
        .set(updateValues)
        .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
        .returning();
    } else {
      [result] = await db.insert(clientCrm).values({
        clientId,
        tenantId,
        ...updateValues,
      }).returning();
    }

    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/clients/:clientId/crm", req);
  }
});

// =============================================================================
// PIPELINE & FOLLOW-UPS
// =============================================================================

router.get("/crm/pipeline", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { owner, tag, search, followUpBefore, followUpAfter } = req.query;

    const conditions: any[] = [eq(clients.tenantId, tenantId)];

    if (owner && typeof owner === "string") {
      conditions.push(eq(clientCrm.ownerUserId, owner));
    }
    if (tag && typeof tag === "string") {
      conditions.push(sql`${tag} = ANY(${clientCrm.tags})`);
    }
    if (search && typeof search === "string") {
      conditions.push(
        sql`(${ilike(clients.companyName, `%${search}%`)} OR ${ilike(clients.displayName, `%${search}%`)})`
      );
    }
    if (followUpBefore && typeof followUpBefore === "string") {
      conditions.push(lte(clientCrm.nextFollowUpAt, new Date(followUpBefore)));
    }
    if (followUpAfter && typeof followUpAfter === "string") {
      conditions.push(gte(clientCrm.nextFollowUpAt, new Date(followUpAfter)));
    }

    const rows = await db
      .select({
        clientId: clients.id,
        companyName: clients.companyName,
        displayName: clients.displayName,
        email: clients.email,
        industry: clients.industry,
        crmStatus: sql<string>`COALESCE(${clientCrm.status}, ${clients.status}, 'active')`.as("crm_status"),
        ownerUserId: clientCrm.ownerUserId,
        ownerName: users.name,
        tags: clientCrm.tags,
        lastContactAt: clientCrm.lastContactAt,
        nextFollowUpAt: clientCrm.nextFollowUpAt,
        followUpNotes: clientCrm.followUpNotes,
        crmUpdatedAt: clientCrm.updatedAt,
      })
      .from(clients)
      .leftJoin(clientCrm, and(eq(clientCrm.clientId, clients.id), eq(clientCrm.tenantId, tenantId)))
      .leftJoin(users, eq(users.id, clientCrm.ownerUserId))
      .where(and(...conditions))
      .orderBy(clients.companyName);

    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/pipeline", req);
  }
});

router.get("/crm/followups", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
    const next7Days = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        clientId: clients.id,
        companyName: clients.companyName,
        displayName: clients.displayName,
        email: clients.email,
        crmStatus: clientCrm.status,
        ownerUserId: clientCrm.ownerUserId,
        ownerName: users.name,
        tags: clientCrm.tags,
        nextFollowUpAt: clientCrm.nextFollowUpAt,
        followUpNotes: clientCrm.followUpNotes,
        lastContactAt: clientCrm.lastContactAt,
      })
      .from(clients)
      .innerJoin(clientCrm, and(eq(clientCrm.clientId, clients.id), eq(clientCrm.tenantId, tenantId)))
      .leftJoin(users, eq(users.id, clientCrm.ownerUserId))
      .where(
        and(
          eq(clients.tenantId, tenantId),
          isNotNull(clientCrm.nextFollowUpAt),
          lte(clientCrm.nextFollowUpAt, next7Days)
        )
      )
      .orderBy(clientCrm.nextFollowUpAt);

    const overdue: typeof rows = [];
    const dueToday: typeof rows = [];
    const next7: typeof rows = [];

    for (const row of rows) {
      if (!row.nextFollowUpAt) continue;
      const followUp = new Date(row.nextFollowUpAt);
      if (followUp < startOfToday) {
        overdue.push(row);
      } else if (followUp <= endOfToday) {
        dueToday.push(row);
      } else {
        next7.push(row);
      }
    }

    res.json({ overdue, dueToday, next7Days: next7 });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/followups", req);
  }
});

const bulkUpdateSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1),
  ownerUserId: z.string().uuid().nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});

router.post("/crm/bulk-update", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const data = validateBody(req.body, bulkUpdateSchema, res);
    if (!data) return;

    const tenantClients = await db.select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, data.clientIds)));

    const validClientIds = tenantClients.map(c => c.id);
    if (validClientIds.length === 0) {
      return sendError(res, AppError.notFound("No valid clients found"), req);
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (data.ownerUserId !== undefined) updateValues.ownerUserId = data.ownerUserId;
    if (data.nextFollowUpAt !== undefined) {
      updateValues.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
    }

    let updatedCount = 0;
    for (const clientId of validClientIds) {
      const [existingCrm] = await db.select()
        .from(clientCrm)
        .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
        .limit(1);

      if (existingCrm) {
        await db.update(clientCrm)
          .set(updateValues)
          .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)));
      } else {
        await db.insert(clientCrm).values({
          clientId,
          tenantId,
          ...updateValues,
        });
      }
      updatedCount++;
    }

    res.json({ success: true, updatedCount });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/bulk-update", req);
  }
});

// =============================================================================
// ACTIVITY TIMELINE
// =============================================================================

router.get("/crm/clients/:clientId/activity", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const typeFilter = req.query.type as string | undefined;

    const clientProjectIds = db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const events: Array<{
      id: string;
      type: string;
      entityId: string;
      summary: string;
      actorUserId: string | null;
      actorName: string | null;
      createdAt: Date;
      metadata: unknown;
    }> = [];

    if (!typeFilter || typeFilter === "project") {
      const projectEvents = await db
        .select({
          id: projects.id,
          name: projects.name,
          status: projects.status,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)))
        .orderBy(desc(projects.createdAt))
        .limit(limit);

      for (const p of projectEvents) {
        events.push({
          id: `project-${p.id}`,
          type: "project",
          entityId: p.id,
          summary: `Project "${p.name}" created (${p.status})`,
          actorUserId: null,
          actorName: null,
          createdAt: p.createdAt,
          metadata: { projectName: p.name, status: p.status },
        });
      }
    }

    if (!typeFilter || typeFilter === "task") {
      const taskEvents = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          createdAt: tasks.createdAt,
          projectId: tasks.projectId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, tenantId),
            sql`${tasks.projectId} IN (${clientProjectIds})`
          )
        )
        .orderBy(desc(tasks.createdAt))
        .limit(limit);

      for (const t of taskEvents) {
        events.push({
          id: `task-${t.id}`,
          type: "task",
          entityId: t.id,
          summary: `Task "${t.title}" ${t.status === "completed" ? "completed" : "created"}`,
          actorUserId: null,
          actorName: null,
          createdAt: t.createdAt,
          metadata: { taskTitle: t.title, status: t.status, projectId: t.projectId },
        });
      }
    }

    if (!typeFilter || typeFilter === "time_entry") {
      const timeEvents = await db
        .select({
          id: timeEntries.id,
          description: timeEntries.description,
          durationSeconds: timeEntries.durationSeconds,
          userId: timeEntries.userId,
          userName: users.name,
          createdAt: timeEntries.createdAt,
          projectId: timeEntries.projectId,
        })
        .from(timeEntries)
        .leftJoin(users, eq(users.id, timeEntries.userId))
        .where(
          and(
            eq(timeEntries.tenantId, tenantId),
            sql`${timeEntries.projectId} IN (${clientProjectIds})`
          )
        )
        .orderBy(desc(timeEntries.createdAt))
        .limit(limit);

      for (const te of timeEvents) {
        const hours = ((te.durationSeconds || 0) / 3600).toFixed(1);
        events.push({
          id: `time-${te.id}`,
          type: "time_entry",
          entityId: te.id,
          summary: `${te.userName || "Someone"} logged ${hours}h${te.description ? `: ${te.description}` : ""}`,
          actorUserId: te.userId,
          actorName: te.userName,
          createdAt: te.createdAt,
          metadata: { hours, projectId: te.projectId },
        });
      }
    }

    if (!typeFilter || typeFilter === "comment") {
      const commentEvents = await db
        .select({
          id: comments.id,
          body: comments.body,
          userId: comments.userId,
          userName: users.name,
          createdAt: comments.createdAt,
          taskId: comments.taskId,
        })
        .from(comments)
        .leftJoin(users, eq(users.id, comments.userId))
        .where(
          and(
            sql`tenant_id = ${tenantId}`,
            sql`${comments.taskId} IN (SELECT id FROM tasks WHERE tenant_id = ${tenantId} AND project_id IN (${clientProjectIds}))`
          )
        )
        .orderBy(desc(comments.createdAt))
        .limit(limit);

      for (const c of commentEvents) {
        const preview = typeof c.body === "string"
          ? c.body.slice(0, 80) + (c.body.length > 80 ? "..." : "")
          : "commented";
        events.push({
          id: `comment-${c.id}`,
          type: "comment",
          entityId: c.id,
          summary: `${c.userName || "Someone"} ${preview}`,
          actorUserId: c.userId,
          actorName: c.userName,
          createdAt: c.createdAt,
          metadata: { taskId: c.taskId },
        });
      }
    }

    if (!typeFilter || typeFilter === "file") {
      const { clientFiles } = await import("@shared/schema");
      const fileEvents = await db
        .select({
          id: clientFiles.id,
          filename: clientFiles.filename,
          uploadedByUserId: clientFiles.uploadedByUserId,
          uploaderName: users.name,
          createdAt: clientFiles.createdAt,
        })
        .from(clientFiles)
        .leftJoin(users, eq(users.id, clientFiles.uploadedByUserId))
        .where(and(eq(clientFiles.clientId, clientId), eq(clientFiles.tenantId, tenantId)))
        .orderBy(desc(clientFiles.createdAt))
        .limit(limit);

      for (const f of fileEvents) {
        events.push({
          id: `file-${f.id}`,
          type: "file",
          entityId: f.id,
          summary: `${f.uploaderName || "Someone"} uploaded "${f.filename}"`,
          actorUserId: f.uploadedByUserId,
          actorName: f.uploaderName,
          createdAt: f.createdAt,
          metadata: { filename: f.filename },
        });
      }
    }

    events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(events.slice(0, limit));
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/activity", req);
  }
});

// =============================================================================
// CLIENT PORTAL / USER CLIENT ACCESS
// =============================================================================

router.get("/crm/clients/:clientId/access", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const accessList = await db
      .select({
        id: userClientAccess.id,
        userId: userClientAccess.userId,
        clientId: userClientAccess.clientId,
        workspaceId: sql<string>`${userClientAccess}.workspace_id`,
        accessLevel: sql<string>`${userClientAccess}.access_level`,
        createdAt: userClientAccess.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(userClientAccess)
      .leftJoin(users, eq(userClientAccess.userId, users.id))
      .where(and(eq(userClientAccess.clientId, clientId), eq(userClientAccess.tenantId, tenantId)));

    res.json(accessList);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/access", req);
  }
});

router.post("/crm/clients/:clientId/access", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const accessSchema = z.object({
      userId: z.string().uuid(),
      accessLevel: z.enum(["view", "comment", "edit"]).optional(),
    });

    const data = validateBody(req.body, accessSchema, res);
    if (!data) return;

    const [existing] = await db.select()
      .from(userClientAccess)
      .where(and(
        eq(userClientAccess.userId, data.userId),
        eq(userClientAccess.clientId, clientId),
        eq(userClientAccess.tenantId, tenantId)
      ))
      .limit(1);

    if (existing) {
      return sendError(res, AppError.badRequest("User already has access to this client"), req);
    }

    const result = await db.execute(sql`
      INSERT INTO user_client_access (tenant_id, user_id, client_id, workspace_id, access_level)
      VALUES (${tenantId}, ${data.userId}, ${clientId}, ${client.workspaceId}, ${data.accessLevel || "view"})
      RETURNING *
    `);
    const access = result.rows?.[0] ?? result[0];

    res.status(201).json(access);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/access", req);
  }
});

router.delete("/crm/access/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(userClientAccess)
      .where(and(eq(userClientAccess.id, id), eq(userClientAccess.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Access record"), req);

    await db.delete(userClientAccess).where(and(eq(userClientAccess.id, id), eq(userClientAccess.tenantId, tenantId)));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/access/:id", req);
  }
});

// =============================================================================
// CLIENT PORTAL DASHBOARD
// =============================================================================

router.get("/crm/portal/dashboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Portal access only"), req);
    }

    const { getClientUserAccessibleClients } = await import("../middleware/clientAccess");
    const clientIds = await getClientUserAccessibleClients(user.id);

    if (clientIds.length === 0) {
      return res.json({
        clients: [],
        projects: [],
        recentTasks: [],
        stats: { totalProjects: 0, activeTasks: 0, completedTasks: 0 },
      });
    }

    const accessibleClients = await db.select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, clientIds)));

    const clientProjects = await db.select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), inArray(projects.clientId, clientIds)));

    const projectIds = clientProjects.map(p => p.id);

    let recentTasks: any[] = [];
    let activeTasks = 0;
    let completedTasks = 0;

    if (projectIds.length > 0) {
      recentTasks = await db.select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        projectId: tasks.projectId,
        createdAt: tasks.createdAt,
      })
        .from(tasks)
        .where(and(eq(tasks.tenantId, tenantId), inArray(tasks.projectId, projectIds)))
        .orderBy(desc(tasks.createdAt))
        .limit(20);

      const [activeCount] = await db.select({ value: count() }).from(tasks)
        .where(and(
          eq(tasks.tenantId, tenantId),
          inArray(tasks.projectId, projectIds),
          sql`${tasks.status} != 'completed'`
        ));
      activeTasks = activeCount?.value || 0;

      const [completedCount] = await db.select({ value: count() }).from(tasks)
        .where(and(
          eq(tasks.tenantId, tenantId),
          inArray(tasks.projectId, projectIds),
          eq(tasks.status, "completed")
        ));
      completedTasks = completedCount?.value || 0;
    }

    res.json({
      clients: accessibleClients,
      projects: clientProjects,
      recentTasks,
      stats: {
        totalProjects: clientProjects.length,
        activeTasks,
        completedTasks,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/portal/dashboard", req);
  }
});

export default router;
