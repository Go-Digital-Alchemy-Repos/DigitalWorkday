import { Router, Request, Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { handleRouteError } from "../../lib/errors";
import {
  parseReportRange,
  reportingGuard,
  getTenantId,
  safePagination,
} from "../../reports/utils";
import {
  buildCacheKey,
  getCached,
  setCache,
  shouldBypassCache,
  setCacheHeaders,
} from "../../lib/reportCache";

const router = Router();

router.use(reportingGuard);

function firstRow<T>(result: unknown): T | null {
  if (Array.isArray(result)) return (result[0] ?? null) as T | null;
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows[0] ?? null);
  }
  return null;
}

async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

router.get("/project/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const { limit, offset } = safePagination(params);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "project-overview", { startDate, endDate, limit, offset });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const summary = firstRow<{
      totalProjects: string;
      activeProjects: string;
      completedProjects: string;
      pausedProjects: string;
      totalHours: string;
      totalTasks: string;
      overdueTasks: string;
    }>(await db.execute(sql`
      SELECT
        COUNT(id)::int AS "totalProjects",
        COUNT(id) FILTER (WHERE status = 'active')::int AS "activeProjects",
        COUNT(id) FILTER (WHERE status = 'completed')::int AS "completedProjects",
        COUNT(id) FILTER (WHERE status = 'paused')::int AS "pausedProjects",
        (SELECT COALESCE(SUM(duration_seconds), 0) FROM time_entries WHERE tenant_id = ${tenantId})::float / 3600.0 AS "totalHours",
        (SELECT COUNT(id) FROM tasks WHERE tenant_id = ${tenantId} AND is_personal = false)::int AS "totalTasks",
        (SELECT COUNT(id) FROM tasks WHERE tenant_id = ${tenantId} AND is_personal = false AND status != 'done' AND due_date < NOW())::int AS "overdueTasks"
      FROM projects
      WHERE tenant_id = ${tenantId}
    `));

    const projects = await dbRows<{
      project_id: string;
      project_name: string;
      project_color: string;
      status: string;
      client_name: string | null;
      team_name: string | null;
      total_tasks: string;
      completed_tasks: string;
      open_tasks: string;
      overdue_tasks: string;
      in_progress_tasks: string;
      completion_rate: string;
      total_hours: string;
      budget_minutes: string | null;
      budget_used_minutes: string;
      budget_utilization_pct: string;
    }>(sql`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.color AS project_color,
        p.status,
        c.company_name AS client_name,
        tm.name AS team_name,
        COUNT(t.id)::int AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS completed_tasks,
        COUNT(t.id) FILTER (WHERE t.status != 'done')::int AS open_tasks,
        COUNT(t.id) FILTER (WHERE t.status != 'done' AND t.due_date < NOW())::int AS overdue_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'in_progress')::int AS in_progress_tasks,
        CASE WHEN COUNT(t.id) > 0
          THEN ROUND(COUNT(t.id) FILTER (WHERE t.status = 'done')::numeric / COUNT(t.id)::numeric * 100, 1)
          ELSE 0
        END AS completion_rate,
        COALESCE(te.total_seconds, 0)::float / 3600.0 AS total_hours,
        p.budget_minutes,
        COALESCE(te.total_seconds, 0)::float / 60.0 AS budget_used_minutes,
        CASE WHEN p.budget_minutes > 0
          THEN ROUND((COALESCE(te.total_seconds, 0)::numeric / 60.0) / p.budget_minutes::numeric * 100, 1)
          ELSE 0
        END AS budget_utilization_pct
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN teams tm ON tm.id = p.team_id
      LEFT JOIN tasks t ON t.project_id = p.id AND t.is_personal = false
      LEFT JOIN (
        SELECT project_id, SUM(duration_seconds) AS total_seconds
        FROM time_entries
        WHERE tenant_id = ${tenantId}
        GROUP BY project_id
      ) te ON te.project_id = p.id
      WHERE p.tenant_id = ${tenantId}
      GROUP BY p.id, p.name, p.color, p.status, c.company_name, tm.name, te.total_seconds
      ORDER BY p.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const statusDistribution = await dbRows<{ status: string; count: number }>(sql`
      SELECT status, COUNT(*)::int AS count
      FROM projects
      WHERE tenant_id = ${tenantId}
      GROUP BY status
    `);

    const responseData = {
      summary: {
        totalProjects: Number(summary?.totalProjects ?? 0),
        activeProjects: Number(summary?.activeProjects ?? 0),
        completedProjects: Number(summary?.completedProjects ?? 0),
        pausedProjects: Number(summary?.pausedProjects ?? 0),
        totalHours: Math.round(Number(summary?.totalHours ?? 0) * 10) / 10,
        totalTasks: Number(summary?.totalTasks ?? 0),
        overdueTasks: Number(summary?.overdueTasks ?? 0),
      },
      projects: projects.map(p => ({
        ...p,
        total_tasks: Number(p.total_tasks),
        completed_tasks: Number(p.completed_tasks),
        open_tasks: Number(p.open_tasks),
        overdue_tasks: Number(p.overdue_tasks),
        in_progress_tasks: Number(p.in_progress_tasks),
        completion_rate: Number(p.completion_rate),
        total_hours: Math.round(Number(p.total_hours) * 10) / 10,
        budget_minutes: p.budget_minutes ? Number(p.budget_minutes) : null,
        budget_used_minutes: Math.round(Number(p.budget_used_minutes)),
        budget_utilization_pct: Number(p.budget_utilization_pct),
      })),
      statusDistribution,
    };

    setCache(cacheKey, responseData);
    setCacheHeaders(res, false);
    res.json(responseData);
  } catch (error) {
    handleRouteError(res, error, "reports-v2/project/overview", req);
  }
});

router.get("/project/time", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "project-time", { startDate, endDate });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const byProject = await dbRows<{
      project_id: string;
      project_name: string;
      project_color: string;
      total_seconds: string;
      billable_seconds: string;
      non_billable_seconds: string;
      user_count: string;
    }>(sql`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.color AS project_color,
        SUM(te.duration_seconds)::bigint AS total_seconds,
        SUM(CASE WHEN te.scope = 'in_scope' THEN te.duration_seconds ELSE 0 END)::bigint AS billable_seconds,
        SUM(CASE WHEN te.scope != 'in_scope' THEN te.duration_seconds ELSE 0 END)::bigint AS non_billable_seconds,
        COUNT(DISTINCT te.user_id)::int AS user_count
      FROM time_entries te
      JOIN projects p ON p.id = te.project_id
      WHERE te.tenant_id = ${tenantId}
        AND te.start_time >= ${startDate}
        AND te.start_time <= ${endDate}
      GROUP BY p.id, p.name, p.color
      ORDER BY total_seconds DESC
    `);

    const weeklyTrend = await dbRows<{ week: string; total_seconds: string }>(sql`
      SELECT
        date_trunc('week', gs.week)::date::text AS week,
        COALESCE(SUM(te.duration_seconds), 0)::bigint AS total_seconds
      FROM generate_series(
        date_trunc('week', ${startDate}::timestamp),
        date_trunc('week', ${endDate}::timestamp),
        '1 week'::interval
      ) AS gs(week)
      LEFT JOIN time_entries te ON te.tenant_id = ${tenantId}
        AND te.start_time >= gs.week
        AND te.start_time < gs.week + INTERVAL '7 days'
      GROUP BY gs.week
      ORDER BY gs.week
    `);

    const summary = firstRow<{
      totalSeconds: string;
      billableSeconds: string;
      nonBillableSeconds: string;
      projectCount: string;
    }>(await db.execute(sql`
      SELECT
        SUM(duration_seconds)::bigint AS "totalSeconds",
        SUM(CASE WHEN scope = 'in_scope' THEN duration_seconds ELSE 0 END)::bigint AS "billableSeconds",
        SUM(CASE WHEN scope != 'in_scope' THEN duration_seconds ELSE 0 END)::bigint AS "nonBillableSeconds",
        COUNT(DISTINCT project_id)::int AS "projectCount"
      FROM time_entries
      WHERE tenant_id = ${tenantId}
        AND start_time >= ${startDate}
        AND start_time <= ${endDate}
    `));

    const responseData = {
      byProject: byProject.map(p => ({
        ...p,
        total_seconds: Number(p.total_seconds),
        billable_seconds: Number(p.billable_seconds),
        non_billable_seconds: Number(p.non_billable_seconds),
        user_count: Number(p.user_count),
      })),
      weeklyTrend: weeklyTrend.map(w => ({
        ...w,
        total_seconds: Number(w.total_seconds),
      })),
      summary: {
        totalSeconds: Number(summary?.totalSeconds ?? 0),
        billableSeconds: Number(summary?.billableSeconds ?? 0),
        nonBillableSeconds: Number(summary?.nonBillableSeconds ?? 0),
        projectCount: Number(summary?.projectCount ?? 0),
      }
    };

    setCache(cacheKey, responseData);
    setCacheHeaders(res, false);
    res.json(responseData);
  } catch (error) {
    handleRouteError(res, error, "reports-v2/project/time", req);
  }
});

router.get("/project/milestones", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "project-milestones", {});

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const byProjectRows = await dbRows<{
      project_id: string;
      project_name: string;
      project_color: string;
      total: string;
      completed: string;
      in_progress: string;
      overdue: string;
    }>(sql`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.color AS project_color,
        COUNT(m.id)::int AS total,
        COUNT(m.id) FILTER (WHERE m.status = 'completed')::int AS completed,
        COUNT(m.id) FILTER (WHERE m.status != 'completed')::int AS in_progress,
        COUNT(m.id) FILTER (WHERE m.status != 'completed' AND m.due_date < NOW())::int AS overdue
      FROM projects p
      JOIN project_milestones m ON m.project_id = p.id
      WHERE p.tenant_id = ${tenantId}
      GROUP BY p.id, p.name, p.color
      ORDER BY p.name ASC
    `);

    // Fetch individual milestones for each project
    const milestones = await dbRows<{
      id: string;
      project_id: string;
      name: string;
      status: string;
      due_date: Date | null;
    }>(sql`
      SELECT id, project_id, name, status, due_date
      FROM project_milestones
      WHERE tenant_id = ${tenantId}
      ORDER BY due_date ASC
    `);

    const summary = firstRow<{
      total: string;
      completed: string;
      overdue: string;
    }>(await db.execute(sql`
      SELECT
        COUNT(id)::int AS total,
        COUNT(id) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(id) FILTER (WHERE status != 'completed' AND due_date < NOW())::int AS overdue
      FROM project_milestones
      WHERE tenant_id = ${tenantId}
    `));

    const responseData = {
      byProject: byProjectRows.map(p => ({
        ...p,
        total: Number(p.total),
        completed: Number(p.completed),
        in_progress: Number(p.in_progress),
        overdue: Number(p.overdue),
        milestones: milestones.filter(m => m.project_id === p.project_id).map(m => ({
          id: m.id,
          name: m.name,
          status: m.status,
          due_date: m.due_date,
        })),
      })),
      summary: {
        total: Number(summary?.total ?? 0),
        completed: Number(summary?.completed ?? 0),
        overdue: Number(summary?.overdue ?? 0),
      }
    };

    setCache(cacheKey, responseData);
    setCacheHeaders(res, false);
    res.json(responseData);
  } catch (error) {
    handleRouteError(res, error, "reports-v2/project/milestones", req);
  }
});

router.get("/project/risk", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "project-risk", {});

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const projectsRows = await dbRows<{
      project_id: string;
      project_name: string;
      project_color: string;
      status: string;
      total_tasks: string;
      overdue_tasks: string;
      completed_tasks: string;
      budget_minutes: string | null;
      used_minutes: string;
      last_activity: Date | null;
    }>(sql`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.color AS project_color,
        p.status,
        COUNT(t.id)::int AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.status != 'done' AND t.due_date < NOW())::int AS overdue_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS completed_tasks,
        p.budget_minutes,
        COALESCE(te.total_seconds, 0)::float / 60.0 AS used_minutes,
        GREATEST(p.updated_at, MAX(t.updated_at), MAX(te.last_entry)) AS last_activity
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.is_personal = false
      LEFT JOIN (
        SELECT project_id, SUM(duration_seconds) AS total_seconds, MAX(start_time) as last_entry
        FROM time_entries
        WHERE tenant_id = ${tenantId}
        GROUP BY project_id
      ) te ON te.project_id = p.id
      WHERE p.tenant_id = ${tenantId} AND p.status = 'active'
      GROUP BY p.id, p.name, p.color, p.status, p.budget_minutes, p.updated_at, te.total_seconds
    `);

    const summary = { critical: 0, high: 0, medium: 0, low: 0 };
    const projects = projectsRows.map(p => {
      const totalTasks = Number(p.total_tasks);
      const overdueTasks = Number(p.overdue_tasks);
      const completedTasks = Number(p.completed_tasks);
      const budgetMinutes = p.budget_minutes ? Number(p.budget_minutes) : null;
      const usedMinutes = Number(p.used_minutes);

      const overduePct = totalTasks > 0 ? (overdueTasks / totalTasks) : 0;
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) : 0;
      const budgetUtilization = budgetMinutes && budgetMinutes > 0 ? (usedMinutes / budgetMinutes) : 0;
      
      const lastActivityDate = p.last_activity ? new Date(p.last_activity) : null;
      const daysSinceActivity = lastActivityDate ? Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;

      const riskFactors = [];
      let riskScore = 0;

      if (overduePct > 0.3) {
        riskFactors.push("High overdue task rate (>30%)");
        riskScore += 30;
      }
      if (completionRate < 0.1 && totalTasks > 5) {
        riskFactors.push("Low completion rate (<10%)");
        riskScore += 20;
      }
      if (budgetUtilization > 0.9) {
        riskFactors.push("Budget nearly exhausted (>90%)");
        riskScore += 25;
      }
      if (daysSinceActivity > 14) {
        riskFactors.push(`No activity in ${daysSinceActivity} days`);
        riskScore += 25;
      }

      let riskLevel: "low" | "medium" | "high" | "critical" = "low";
      if (riskScore >= 76) riskLevel = "critical";
      else if (riskScore >= 51) riskLevel = "high";
      else if (riskScore >= 26) riskLevel = "medium";

      summary[riskLevel]++;

      return {
        project_id: p.project_id,
        project_name: p.project_name,
        project_color: p.project_color,
        status: p.status,
        risk_score: Math.min(riskScore, 100),
        risk_level: riskLevel,
        risk_factors: riskFactors,
      };
    });

    const responseData = {
      projects,
      summary,
    };

    setCache(cacheKey, responseData);
    setCacheHeaders(res, false);
    res.json(responseData);
  } catch (error) {
    handleRouteError(res, error, "reports-v2/project/risk", req);
  }
});

export default router;
