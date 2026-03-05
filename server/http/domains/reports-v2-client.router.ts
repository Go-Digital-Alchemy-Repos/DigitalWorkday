import { Router, Request, Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { handleRouteError } from "../../lib/errors";
import {
  parseReportRange,
  normalizeFilters,
  safePagination,
  reportingGuard,
  getTenantId,
} from "../../reports/utils";

const router = Router();

router.use(reportingGuard);

function buildClientMetaFilters(filters: ReturnType<typeof normalizeFilters>) {
  const parts: ReturnType<typeof sql>[] = [];
  if (filters.industries.length > 0) {
    parts.push(sql`AND c.industry = ANY(ARRAY[${sql.join(filters.industries.map(i => sql`${i}`), sql`, `)}]::text[])`);
  }
  if (filters.tags.length > 0) {
    parts.push(sql`AND c.tags && ARRAY[${sql.join(filters.tags.map(t => sql`${t}`), sql`, `)}]::text[]`);
  }
  return parts.length > 0 ? sql.join(parts, sql` `) : sql``;
}

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

router.get("/client/filter-options", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const [industryRows, tagRows] = await Promise.all([
      dbRows<{ industry: string }>(sql`
        SELECT DISTINCT industry FROM clients
        WHERE tenant_id = ${tenantId} AND industry IS NOT NULL AND industry != ''
        ORDER BY industry
      `),
      dbRows<{ tag: string }>(sql`
        SELECT DISTINCT t AS tag FROM clients, UNNEST(tags) AS t
        WHERE tenant_id = ${tenantId} AND tags IS NOT NULL AND t IS NOT NULL AND t != ''
        ORDER BY tag
      `),
    ]);

    res.json({
      industries: industryRows.map(r => r.industry),
      tags: tagRows.map(r => r.tag),
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/filter-options", req);
  }
});

router.get("/client/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const clientFilter = filters.clientIds.length > 0
      ? sql`AND c.id = ANY(ARRAY[${sql.join(filters.clientIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;
    const metaFilter = buildClientMetaFilters(filters);

    const rows = await dbRows<{
      client_id: string;
      company_name: string;
      industry: string | null;
      tags: string[] | null;
      active_projects: string;
      open_tasks: string;
      overdue_tasks: string;
      completed_in_range: string;
      total_hours: string;
      last_activity_date: string | null;
    }>(sql`
      SELECT
        c.id AS client_id,
        c.company_name,
        c.industry,
        c.tags,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS active_projects,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done', 'cancelled') THEN t.id END) AS open_tasks,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'done' AND t.updated_at BETWEEN ${startDate} AND ${endDate} THEN t.id END) AS completed_in_range,
        COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0)::float / 3600.0 AS total_hours,
        GREATEST(MAX(t.updated_at), MAX(te.start_time)) AS last_activity_date
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
        ${clientFilter}
        ${metaFilter}
      GROUP BY c.id, c.company_name, c.industry, c.tags
      ORDER BY open_tasks DESC, total_hours DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM clients c WHERE c.tenant_id = ${tenantId}
      ${clientFilter}
      ${metaFilter}
    `));

    const clients = rows.map((r) => {
      const totalHours = Math.round(Number(r.total_hours) * 10) / 10;
      const openTasks = Number(r.open_tasks);
      const completedInRange = Number(r.completed_in_range);
      const engagementScore = Math.min(
        100,
        Math.round(
          Math.min(totalHours, 40) / 40 * 40 +
          Math.min(openTasks, 20) / 20 * 40 +
          Math.min(completedInRange, 10) / 10 * 20
        )
      );

      return {
        clientId: r.client_id,
        companyName: r.company_name,
        industry: r.industry ?? null,
        tags: r.tags ?? [],
        activeProjects: Number(r.active_projects),
        openTasks,
        overdueTasks: Number(r.overdue_tasks),
        completedInRange,
        totalHours,
        billableHours: 0,
        lastActivityDate: r.last_activity_date ?? null,
        engagementScore,
      };
    });

    res.json({
      clients,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/overview", req);
  }
});

router.get("/client/activity", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const clientFilter = filters.clientIds.length > 0
      ? sql`AND c.id = ANY(ARRAY[${sql.join(filters.clientIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;
    const metaFilter = buildClientMetaFilters(filters);

    const rows = await dbRows<{
      client_id: string;
      company_name: string;
      tasks_created_in_range: string;
      time_logged_in_range: string;
      comments_in_range: string;
      last_activity: string | null;
    }>(sql`
      SELECT
        c.id AS client_id,
        c.company_name,
        COUNT(DISTINCT CASE WHEN t.created_at BETWEEN ${startDate} AND ${endDate} THEN t.id END) AS tasks_created_in_range,
        COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0)::float / 3600.0 AS time_logged_in_range,
        COUNT(DISTINCT CASE WHEN cm.created_at BETWEEN ${startDate} AND ${endDate} THEN cm.id END) AS comments_in_range,
        GREATEST(MAX(t.updated_at), MAX(te.start_time), MAX(cm.created_at)) AS last_activity
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
      LEFT JOIN comments cm ON cm.task_id = t.id
      WHERE c.tenant_id = ${tenantId}
        ${clientFilter}
        ${metaFilter}
      GROUP BY c.id, c.company_name
      ORDER BY time_logged_in_range DESC, tasks_created_in_range DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM clients c WHERE c.tenant_id = ${tenantId}
      ${clientFilter}
      ${metaFilter}
    `));

    const clients = rows.map((r) => {
      const lastActivity = r.last_activity ? new Date(r.last_activity) : null;
      const inactivityDays = lastActivity
        ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        clientId: r.client_id,
        companyName: r.company_name,
        tasksCreatedInRange: Number(r.tasks_created_in_range),
        timeLoggedInRange: Math.round(Number(r.time_logged_in_range) * 10) / 10,
        commentsInRange: Number(r.comments_in_range),
        inactivityDays,
      };
    });

    res.json({
      clients,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/activity", req);
  }
});

router.get("/client/time", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const clientFilter = filters.clientIds.length > 0
      ? sql`AND c.id = ANY(ARRAY[${sql.join(filters.clientIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;
    const metaFilter = buildClientMetaFilters(filters);

    const rows = await dbRows<{
      client_id: string;
      company_name: string;
      total_seconds: string;
      estimated_minutes: string;
    }>(sql`
      SELECT
        c.id AS client_id,
        c.company_name,
        COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0) AS total_seconds,
        COALESCE(SUM(CASE WHEN t.status NOT IN ('done','cancelled') THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END), 0) AS estimated_minutes
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
        ${clientFilter}
        ${metaFilter}
      GROUP BY c.id, c.company_name
      ORDER BY total_seconds DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const topProjectsRows = await dbRows<{
      client_id: string;
      project_id: string;
      project_name: string;
      hours: string;
    }>(sql`
      SELECT
        c.id AS client_id,
        p.id AS project_id,
        p.name AS project_name,
        COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0)::float / 3600.0 AS hours
      FROM clients c
      JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
        ${clientFilter}
        ${metaFilter}
      GROUP BY c.id, p.id, p.name
      HAVING COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0) > 0
      ORDER BY c.id, hours DESC
    `);

    const topProjectsByClient = new Map<string, Array<{ projectId: string; projectName: string; hours: number }>>();
    for (const r of topProjectsRows) {
      if (!topProjectsByClient.has(r.client_id)) {
        topProjectsByClient.set(r.client_id, []);
      }
      const arr = topProjectsByClient.get(r.client_id)!;
      if (arr.length < 5) {
        arr.push({
          projectId: r.project_id,
          projectName: r.project_name,
          hours: Math.round(Number(r.hours) * 10) / 10,
        });
      }
    }

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM clients c WHERE c.tenant_id = ${tenantId}
      ${clientFilter}
      ${metaFilter}
    `));

    const clients = rows.map((r) => {
      const totalHours = Math.round(Number(r.total_seconds) / 3600 * 10) / 10;
      const billableHours = 0;
      const nonBillableHours = Math.round((totalHours - billableHours) * 10) / 10;
      const estimatedHours = Math.round(Number(r.estimated_minutes) / 60 * 10) / 10;
      const varianceHours = Math.round((totalHours - estimatedHours) * 10) / 10;

      return {
        clientId: r.client_id,
        companyName: r.company_name,
        totalSeconds: Number(r.total_seconds),
        billableSeconds: 0,
        estimatedMinutes: Number(r.estimated_minutes),
        totalHours,
        billableHours,
        nonBillableHours,
        estimatedHours,
        varianceHours,
        topProjects: topProjectsByClient.get(r.client_id) ?? [],
      };
    });

    res.json({
      clients,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/time", req);
  }
});

router.get("/client/tasks", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const clientFilter = filters.clientIds.length > 0
      ? sql`AND c.id = ANY(ARRAY[${sql.join(filters.clientIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;
    const metaFilter = buildClientMetaFilters(filters);

    const rows = await dbRows<{
      client_id: string;
      company_name: string;
      open_task_count: string;
      overdue_count: string;
      completed_in_range: string;
      aging_under7: string;
      aging_7_14: string;
      aging_14_30: string;
      aging_over30: string;
    }>(sql`
      SELECT
        c.id AS client_id,
        c.company_name,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) AS open_task_count,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_count,
        COUNT(DISTINCT CASE WHEN t.status = 'done' AND t.updated_at BETWEEN ${startDate} AND ${endDate} THEN t.id END) AS completed_in_range,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled') AND EXTRACT(days FROM NOW() - t.created_at) < 7
          THEN t.id END) AS aging_under7,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled')
            AND EXTRACT(days FROM NOW() - t.created_at) >= 7
            AND EXTRACT(days FROM NOW() - t.created_at) < 14
          THEN t.id END) AS aging_7_14,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled')
            AND EXTRACT(days FROM NOW() - t.created_at) >= 14
            AND EXTRACT(days FROM NOW() - t.created_at) < 30
          THEN t.id END) AS aging_14_30,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled') AND EXTRACT(days FROM NOW() - t.created_at) >= 30
          THEN t.id END) AS aging_over30
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
        ${clientFilter}
        ${metaFilter}
      GROUP BY c.id, c.company_name
      ORDER BY open_task_count DESC, overdue_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM clients c WHERE c.tenant_id = ${tenantId}
      ${clientFilter}
      ${metaFilter}
    `));

    const clients = rows.map((r) => ({
      clientId: r.client_id,
      companyName: r.company_name,
      openTaskCount: Number(r.open_task_count),
      overdueCount: Number(r.overdue_count),
      completedInRange: Number(r.completed_in_range),
      agingUnder7: Number(r.aging_under7),
      aging7to14: Number(r.aging_7_14),
      aging14to30: Number(r.aging_14_30),
      agingOver30: Number(r.aging_over30),
    }));

    res.json({
      clients,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/tasks", req);
  }
});

router.get("/client/sla", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const clientFilter = filters.clientIds.length > 0
      ? sql`AND c.id = ANY(ARRAY[${sql.join(filters.clientIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;
    const metaFilter = buildClientMetaFilters(filters);

    const rows = await dbRows<{
      client_id: string;
      company_name: string;
      total_tasks: string;
      overdue_count: string;
      completed_on_time: string;
      total_done_with_due: string;
    }>(sql`
      SELECT
        c.id AS client_id,
        c.company_name,
        COUNT(DISTINCT t.id) AS total_tasks,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_count,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done' AND t.due_date IS NOT NULL AND t.updated_at <= t.due_date
          THEN t.id END) AS completed_on_time,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done' AND t.due_date IS NOT NULL
          THEN t.id END) AS total_done_with_due
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
        ${clientFilter}
        ${metaFilter}
      GROUP BY c.id, c.company_name
      ORDER BY overdue_count DESC, total_tasks DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM clients c WHERE c.tenant_id = ${tenantId}
      ${clientFilter}
      ${metaFilter}
    `));

    const clients = rows.map((r) => {
      const totalTasks = Number(r.total_tasks);
      const overdueCount = Number(r.overdue_count);
      const completedOnTime = Number(r.completed_on_time);
      const totalDoneWithDue = Number(r.total_done_with_due);

      const overdueTaskPct = totalTasks > 0
        ? Math.round((overdueCount / totalTasks) * 100 * 10) / 10
        : 0;
      const completedWithinDuePct = totalDoneWithDue > 0
        ? Math.round((completedOnTime / totalDoneWithDue) * 100 * 10) / 10
        : 0;

      return {
        clientId: r.client_id,
        companyName: r.company_name,
        totalTasks,
        overdueCount,
        completedOnTime,
        totalDoneWithDue,
        overdueTaskPct,
        completedWithinDuePct,
      };
    });

    res.json({
      clients,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/sla", req);
  }
});

router.get("/client/risk", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const metaFilter = buildClientMetaFilters(filters);

    const rows = await dbRows<{
      client_id: string;
      company_name: string;
      total_tasks: string;
      overdue_count: string;
      total_seconds_in_range: string;
      estimated_minutes: string;
      active_projects: string;
      last_task_update: string | null;
    }>(sql`
      SELECT
        c.id AS client_id,
        c.company_name,
        COUNT(DISTINCT t.id) AS total_tasks,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_count,
        COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0) AS total_seconds_in_range,
        COALESCE(SUM(CASE WHEN t.status NOT IN ('done','cancelled') THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END), 0) AS estimated_minutes,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS active_projects,
        MAX(t.updated_at) AS last_task_update
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
        ${metaFilter}
      GROUP BY c.id, c.company_name
    `);

    const flagged = [];

    for (const r of rows) {
      const totalTasks = Number(r.total_tasks);
      const overdueCount = Number(r.overdue_count);
      const totalSeconds = Number(r.total_seconds_in_range);
      const totalHours = totalSeconds / 3600;
      const estimatedMinutes = Number(r.estimated_minutes);
      const estimatedHours = estimatedMinutes / 60;
      const activeProjects = Number(r.active_projects);
      const lastTaskUpdate = r.last_task_update ? new Date(r.last_task_update) : null;
      const inactivityDays = lastTaskUpdate
        ? Math.floor((Date.now() - lastTaskUpdate.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      const reasons: string[] = [];
      let score = 0;

      if (totalTasks > 0 && overdueCount / totalTasks > 0.30) {
        reasons.push(`High overdue rate: ${Math.round(overdueCount / totalTasks * 100)}% of tasks are overdue`);
        score += 3;
      }
      if (totalHours < 1 && inactivityDays > 14) {
        reasons.push(`Low engagement: no time logged in range and inactive for ${inactivityDays} days`);
        score += 3;
      }
      if (estimatedHours > 0 && totalHours > estimatedHours * 1.2) {
        reasons.push(`Time overrun: ${totalHours.toFixed(1)}h logged vs ${estimatedHours.toFixed(1)}h estimated`);
        score += 2;
      }
      if (activeProjects > 0 && inactivityDays >= 21) {
        reasons.push(`Stalled projects: ${activeProjects} active project(s) with no task updates in ${inactivityDays} days`);
        score += 2;
      }

      if (reasons.length > 0) {
        flagged.push({
          clientId: r.client_id,
          companyName: r.company_name,
          reasons,
          score,
          metrics: {
            totalTasks,
            overdueCount,
            totalHours: Math.round(totalHours * 10) / 10,
            estimatedHours: Math.round(estimatedHours * 10) / 10,
            activeProjects,
            inactivityDays,
          },
        });
      }
    }

    flagged.sort((a, b) => b.score - a.score);

    res.json({
      flagged,
      totalChecked: rows.length,
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/risk", req);
  }
});

// ── CHI: Client Health Index ───────────────────────────────────────────────────

router.get("/client/health-index", async (req: Request, res: Response) => {
  try {
    const { calculateClientHealth } = await import("../../reports/health/calculateClientHealth");
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const clientId = filters.clientIds.length === 1 ? filters.clientIds[0] : null;

    const { results, total } = await calculateClientHealth({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      clientId,
      limit,
      offset,
    });

    res.json({
      clients: results,
      pagination: { total, limit, offset },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/health-index", req);
  }
});

router.get("/client/:clientId/profile", async (req: Request, res: Response) => {
  try {
    const { config } = await import("../../config");
    if (!config.features.enableClientProfileReport) {
      return res.status(403).json({ message: "Client profile report feature is disabled" });
    }

    const tenantId = getTenantId(req);
    const { clientId } = req.params;
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);

    const { getClientProfileReport } = await import("../../reports/clientProfileAggregator");

    const report = await getClientProfileReport({
      tenantId,
      clientId,
      startDate,
      endDate,
    });

    if (!report) {
      return res.status(404).json({ message: "Client not found or does not belong to this tenant" });
    }

    res.json(report);
  } catch (error) {
    handleRouteError(res, error, "reports-v2/client/profile", req);
  }
});

export default router;
