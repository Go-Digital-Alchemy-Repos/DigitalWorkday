import { Request } from "express";
import { createApiRouter } from "../routerFactory";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { UserRole } from "@shared/schema";
import { AppError, handleRouteError } from "../../lib/errors";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import {
  buildCacheKey,
  getCached,
  setCache,
  shouldBypassCache,
  setCacheHeaders,
} from "../../lib/reportCache";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

function isAdmin(req: Request): boolean {
  const role = (req.user as any)?.role;
  return role === UserRole.ADMIN || role === UserRole.SUPER_USER || role === UserRole.TENANT_OWNER;
}

function rows(result: any): any[] {
  return result.rows ?? result ?? [];
}

function firstRow(result: any): any {
  const r = rows(result);
  return r[0] ?? {};
}

router.get("/reports/tasks/analytics", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }
    const tenantId = getEffectiveTenantId(req);
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const breakdownLimit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const breakdownOffset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "tasks-analytics", { days, breakdownLimit, breakdownOffset });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const statusDist = await db.execute(sql`
      SELECT status, COUNT(*)::int AS count
      FROM tasks
      WHERE tenant_id = ${tenantId} AND is_personal = false
      GROUP BY status
      ORDER BY count DESC
    `);

    const priorityDist = await db.execute(sql`
      SELECT priority, COUNT(*)::int AS count
      FROM tasks
      WHERE tenant_id = ${tenantId} AND is_personal = false
      GROUP BY priority
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END
    `);

    const overdueBuckets = await db.execute(sql`
      SELECT
        CASE
          WHEN due_date >= CURRENT_DATE THEN 'not_overdue'
          WHEN CURRENT_DATE - due_date::date <= 3 THEN '1_3_days'
          WHEN CURRENT_DATE - due_date::date <= 7 THEN '4_7_days'
          WHEN CURRENT_DATE - due_date::date <= 14 THEN '1_2_weeks'
          ELSE 'over_2_weeks'
        END AS bucket,
        COUNT(*)::int AS count
      FROM tasks
      WHERE tenant_id = ${tenantId} AND is_personal = false AND status != 'done' AND due_date IS NOT NULL
      GROUP BY bucket
    `);

    const createdVsCompleted = await db.execute(sql`
      SELECT
        TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
        COALESCE(c.created, 0)::int AS created,
        COALESCE(comp.completed, 0)::int AS completed
      FROM generate_series(
        CURRENT_DATE - make_interval(days => ${days}),
        CURRENT_DATE,
        '1 day'
      ) AS d(day)
      LEFT JOIN (
        SELECT DATE(created_at) AS day, COUNT(*)::int AS created
        FROM tasks
        WHERE tenant_id = ${tenantId} AND is_personal = false
          AND created_at >= CURRENT_DATE - make_interval(days => ${days})
        GROUP BY DATE(created_at)
      ) c ON c.day = d.day
      LEFT JOIN (
        SELECT DATE(updated_at) AS day, COUNT(*)::int AS completed
        FROM tasks
        WHERE tenant_id = ${tenantId} AND is_personal = false AND status = 'done'
          AND updated_at >= CURRENT_DATE - make_interval(days => ${days})
        GROUP BY DATE(updated_at)
      ) comp ON comp.day = d.day
      ORDER BY d.day
    `);

    const completionByProject = await db.execute(sql`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.color AS project_color,
        COUNT(t.id)::int AS total,
        COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS completed,
        CASE WHEN COUNT(t.id) > 0
          THEN ROUND(COUNT(t.id) FILTER (WHERE t.status = 'done')::numeric / COUNT(t.id)::numeric * 100, 1)
          ELSE 0
        END AS completion_rate
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.is_personal = false
      WHERE p.tenant_id = ${tenantId} AND p.status = 'active'
      GROUP BY p.id, p.name, p.color
      HAVING COUNT(t.id) > 0
      ORDER BY total DESC
      LIMIT ${breakdownLimit} OFFSET ${breakdownOffset}
    `);

    const completionByProjectCount = firstRow(await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT p.id
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id AND t.is_personal = false
        WHERE p.tenant_id = ${tenantId} AND p.status = 'active'
        GROUP BY p.id
        HAVING COUNT(t.id) > 0
      ) sub
    `));

    const assigneeDistribution = await db.execute(sql`
      SELECT
        u.id AS user_id,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) AS name,
        u.avatar_url,
        COUNT(t.id)::int AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS completed,
        COUNT(t.id) FILTER (WHERE t.status != 'done')::int AS open,
        COUNT(t.id) FILTER (WHERE t.due_date < NOW() AND t.status != 'done')::int AS overdue
      FROM task_assignees ta
      JOIN users u ON u.id = ta.user_id
      JOIN tasks t ON t.id = ta.task_id AND t.is_personal = false AND t.tenant_id = ${tenantId}
      WHERE ta.tenant_id = ${tenantId}
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
      ORDER BY total_tasks DESC
      LIMIT ${breakdownLimit} OFFSET ${breakdownOffset}
    `);

    const assigneeCount = firstRow(await db.execute(sql`
      SELECT COUNT(DISTINCT ta.user_id)::int AS total
      FROM task_assignees ta
      JOIN tasks t ON t.id = ta.task_id AND t.is_personal = false AND t.tenant_id = ${tenantId}
      WHERE ta.tenant_id = ${tenantId}
    `));

    const responseData = {
      statusDistribution: rows(statusDist),
      priorityDistribution: rows(priorityDist),
      overdueBuckets: rows(overdueBuckets),
      createdVsCompleted: rows(createdVsCompleted),
      completionByProject: rows(completionByProject).map((r: any) => ({
        ...r,
        completion_rate: parseFloat(r.completion_rate) || 0,
      })),
      assigneeDistribution: rows(assigneeDistribution),
      pagination: {
        limit: breakdownLimit,
        offset: breakdownOffset,
        projectsTotal: completionByProjectCount?.total ?? 0,
        assigneesTotal: assigneeCount?.total ?? 0,
      },
    };

    setCache(cacheKey, responseData);
    setCacheHeaders(res, false);
    res.json(responseData);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/reports/tasks/analytics", req);
  }
});

router.get("/reports/clients/analytics", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }
    const tenantId = getEffectiveTenantId(req);
    const breakdownLimit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const breakdownOffset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "clients-analytics", { breakdownLimit, breakdownOffset });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const clientSummary = await db.execute(sql`
      SELECT
        c.id,
        c.company_name,
        c.stage,
        c.status,
        COALESCE(proj.project_count, 0)::int AS project_count,
        COALESCE(proj.active_projects, 0)::int AS active_projects,
        COALESCE(t.task_count, 0)::int AS task_count,
        COALESCE(t.completed_tasks, 0)::int AS completed_tasks,
        COALESCE(ROUND(te.total_seconds::numeric / 3600, 1), 0) AS total_hours,
        COALESCE(te.entry_count, 0)::int AS time_entries,
        COALESCE(proj.total_budget_minutes, 0)::int AS budget_minutes
      FROM clients c
      LEFT JOIN (
        SELECT
          client_id,
          COUNT(*)::int AS project_count,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_projects,
          COALESCE(SUM(budget_minutes), 0)::int AS total_budget_minutes
        FROM projects
        WHERE tenant_id = ${tenantId}
        GROUP BY client_id
      ) proj ON proj.client_id = c.id
      LEFT JOIN (
        SELECT
          p.client_id,
          COUNT(tsk.id)::int AS task_count,
          COUNT(tsk.id) FILTER (WHERE tsk.status = 'done')::int AS completed_tasks
        FROM tasks tsk
        JOIN projects p ON p.id = tsk.project_id
        WHERE tsk.tenant_id = ${tenantId} AND tsk.is_personal = false
        GROUP BY p.client_id
      ) t ON t.client_id = c.id
      LEFT JOIN (
        SELECT
          client_id,
          SUM(duration_seconds) AS total_seconds,
          COUNT(*)::int AS entry_count
        FROM time_entries
        WHERE tenant_id = ${tenantId}
        GROUP BY client_id
      ) te ON te.client_id = c.id
      WHERE c.tenant_id = ${tenantId}
      ORDER BY COALESCE(te.total_seconds, 0) DESC
      LIMIT ${breakdownLimit} OFFSET ${breakdownOffset}
    `);

    const clientTotalCount = firstRow(await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM clients WHERE tenant_id = ${tenantId}
    `));

    const clientAggregateSummary = firstRow(await db.execute(sql`
      SELECT
        COUNT(DISTINCT c.id)::int AS total_clients,
        COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END)::int AS active_clients,
        COUNT(DISTINCT p.id)::int AS total_projects,
        COALESCE(ROUND(SUM(te.duration_seconds)::numeric / 3600, 1), 0) AS total_hours,
        (
          SELECT COUNT(DISTINCT c2.id)
          FROM clients c2
          JOIN projects p2 ON p2.client_id = c2.id AND p2.tenant_id = ${tenantId}
          WHERE c2.tenant_id = ${tenantId}
            AND p2.budget_minutes IS NOT NULL
            AND p2.budget_minutes > 0
        )::int AS budgeted_clients
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.client_id = c.id AND te.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
    `)) as any;

    const stageDistribution = await db.execute(sql`
      SELECT stage, COUNT(*)::int AS count
      FROM clients
      WHERE tenant_id = ${tenantId}
      GROUP BY stage
      ORDER BY count DESC
    `);

    const topClientsByHours = await db.execute(sql`
      SELECT
        c.id,
        c.company_name,
        COALESCE(ROUND(SUM(te.duration_seconds)::numeric / 3600, 1), 0) AS hours,
        COUNT(te.id)::int AS entries
      FROM clients c
      LEFT JOIN time_entries te ON te.client_id = c.id AND te.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.id, c.company_name
      HAVING SUM(te.duration_seconds) > 0
      ORDER BY hours DESC
      LIMIT ${breakdownLimit} OFFSET ${breakdownOffset}
    `);

    const budgetUtilization = await db.execute(sql`
      SELECT
        c.id,
        c.company_name,
        COALESCE(SUM(p.budget_minutes), 0)::int AS budget_minutes,
        COALESCE(ROUND(SUM(te.total_seconds)::numeric / 60, 0), 0)::int AS used_minutes
      FROM clients c
      JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN (
        SELECT project_id, SUM(duration_seconds) AS total_seconds
        FROM time_entries
        WHERE tenant_id = ${tenantId}
        GROUP BY project_id
      ) te ON te.project_id = p.id
      WHERE c.tenant_id = ${tenantId} AND p.budget_minutes IS NOT NULL AND p.budget_minutes > 0
      GROUP BY c.id, c.company_name
      HAVING SUM(p.budget_minutes) > 0
      ORDER BY budget_minutes DESC
      LIMIT ${breakdownLimit} OFFSET ${breakdownOffset}
    `);

    const responseData = {
      clients: rows(clientSummary).map((r: any) => ({
        ...r,
        total_hours: parseFloat(r.total_hours) || 0,
      })),
      stageDistribution: rows(stageDistribution),
      topClientsByHours: rows(topClientsByHours).map((r: any) => ({
        ...r,
        hours: parseFloat(r.hours) || 0,
      })),
      budgetUtilization: rows(budgetUtilization).map((r: any) => ({
        ...r,
        utilizationPercent: r.budget_minutes > 0
          ? Math.round((r.used_minutes / r.budget_minutes) * 100)
          : 0,
      })),
      summary: {
        totalClients: parseInt(clientAggregateSummary?.total_clients ?? "0", 10),
        activeClients: parseInt(clientAggregateSummary?.active_clients ?? "0", 10),
        totalProjects: parseInt(clientAggregateSummary?.total_projects ?? "0", 10),
        totalHours: parseFloat(clientAggregateSummary?.total_hours ?? "0"),
        budgetedClients: parseInt(clientAggregateSummary?.budgeted_clients ?? "0", 10),
      },
      pagination: {
        limit: breakdownLimit,
        offset: breakdownOffset,
        clientsTotal: clientTotalCount?.total ?? 0,
      },
    };

    setCache(cacheKey, responseData);
    setCacheHeaders(res, false);
    res.json(responseData);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/reports/clients/analytics", req);
  }
});

export default router;
