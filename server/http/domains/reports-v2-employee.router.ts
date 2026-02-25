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
  formatMinutesToHours,
} from "../../reports/utils";

const router = Router();

router.use(reportingGuard);

function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

router.get("/employee/overview", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const userFilter = filters.userIds.length > 0
      ? sql`AND u.id = ANY(ARRAY[${sql.join(filters.userIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;

    const daysInRange = Math.max(
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      1
    );

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      avatar_url: string | null;
      active_tasks: string;
      overdue_tasks: string;
      completed_in_range: string;
      total_seconds: string;
      billable_seconds: string;
      estimated_minutes: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled') THEN t.id
        END) AS active_tasks,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW() THEN t.id
        END) AS overdue_tasks,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done'
            AND t.updated_at >= ${startDate}
            AND t.updated_at <= ${endDate}
          THEN t.id
        END) AS completed_in_range,
        COALESCE(SUM(
          CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
          THEN te.duration_seconds ELSE 0 END
        ), 0) AS total_seconds,
        COALESCE(SUM(
          CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
            AND te.is_billable = true
          THEN te.duration_seconds ELSE 0 END
        ), 0) AS billable_seconds,
        COALESCE(SUM(
          CASE WHEN t.status NOT IN ('done', 'cancelled')
          THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END
        ), 0) AS estimated_minutes
      FROM users u
      LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.user_id = u.id AND te.tenant_id = ${tenantId}
      WHERE u.tenant_id = ${tenantId}
        AND u.role IN ('admin', 'employee')
        ${userFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
      ORDER BY active_tasks DESC, overdue_tasks DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      WHERE u.tenant_id = ${tenantId} AND u.role IN ('admin', 'employee')
      ${userFilter}
    `));

    const employees = rows.map((r) => {
      const activeTasks = Number(r.active_tasks);
      const overdueTasks = Number(r.overdue_tasks);
      const completedInRange = Number(r.completed_in_range);
      const totalHours = Math.round(Number(r.total_seconds) / 3600 * 10) / 10;
      const billableHours = Math.round(Number(r.billable_seconds) / 3600 * 10) / 10;
      const estimatedHours = formatMinutesToHours(Number(r.estimated_minutes));
      const utilizationPct = Math.round(totalHours / (daysInRange * 8) * 100);
      const efficiencyRatio = estimatedHours > 0
        ? Math.round((totalHours / estimatedHours) * 100) / 100
        : null;
      const completionDenom = completedInRange + activeTasks;
      const completionRate = completionDenom > 0
        ? Math.round((completedInRange / completionDenom) * 100)
        : null;

      return {
        userId: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        avatarUrl: r.avatar_url,
        activeTasks,
        overdueTasks,
        completedInRange,
        totalHours,
        billableHours,
        estimatedHours,
        utilizationPct,
        efficiencyRatio,
        completionRate,
      };
    });

    res.json({
      employees,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/employee/overview", req);
  }
});

router.get("/employee/workload", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const userFilter = filters.userIds.length > 0
      ? sql`AND u.id = ANY(ARRAY[${sql.join(filters.userIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      assigned_count: string;
      due_soon_count: string;
      overdue_count: string;
      avg_completion_days: string | null;
      backlog_count: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled') THEN t.id
        END) AS assigned_count,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled')
            AND t.due_date > NOW()
            AND t.due_date <= NOW() + INTERVAL '7 days'
          THEN t.id
        END) AS due_soon_count,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW() THEN t.id
        END) AS overdue_count,
        AVG(CASE
          WHEN t.status = 'done'
            AND t.updated_at >= ${startDate}
            AND t.updated_at <= ${endDate}
          THEN EXTRACT(days FROM (t.updated_at - t.created_at))
        END) AS avg_completion_days,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled')
            AND t.updated_at < NOW() - INTERVAL '14 days'
          THEN t.id
        END) AS backlog_count
      FROM users u
      LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      WHERE u.tenant_id = ${tenantId}
        AND u.role IN ('admin', 'employee')
        ${userFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY assigned_count DESC, overdue_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      WHERE u.tenant_id = ${tenantId} AND u.role IN ('admin', 'employee')
      ${userFilter}
    `));

    const employees = rows.map((r) => ({
      userId: r.user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      assignedCount: Number(r.assigned_count),
      dueSoonCount: Number(r.due_soon_count),
      overdueCount: Number(r.overdue_count),
      avgCompletionDays: r.avg_completion_days != null
        ? Math.round(Number(r.avg_completion_days) * 10) / 10
        : null,
      backlogCount: Number(r.backlog_count),
    }));

    res.json({
      employees,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/employee/workload", req);
  }
});

router.get("/employee/time", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const userFilter = filters.userIds.length > 0
      ? sql`AND u.id = ANY(ARRAY[${sql.join(filters.userIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      total_seconds: string;
      billable_seconds: string;
      estimated_minutes: string;
      logged_days: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        COALESCE(SUM(
          CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
          THEN te.duration_seconds ELSE 0 END
        ), 0) AS total_seconds,
        COALESCE(SUM(
          CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
            AND te.is_billable = true
          THEN te.duration_seconds ELSE 0 END
        ), 0) AS billable_seconds,
        COALESCE(SUM(
          CASE WHEN t.status NOT IN ('done', 'cancelled')
          THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END
        ), 0) AS estimated_minutes,
        COUNT(DISTINCT
          CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
          THEN DATE(te.start_time) END
        ) AS logged_days
      FROM users u
      LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.user_id = u.id AND te.tenant_id = ${tenantId}
      WHERE u.tenant_id = ${tenantId}
        AND u.role IN ('admin', 'employee')
        ${userFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY total_seconds DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      WHERE u.tenant_id = ${tenantId} AND u.role IN ('admin', 'employee')
      ${userFilter}
    `));

    const employees = rows.map((r) => {
      const totalHours = Math.round(Number(r.total_seconds) / 3600 * 10) / 10;
      const billableHours = Math.round(Number(r.billable_seconds) / 3600 * 10) / 10;
      const nonBillableHours = Math.round((totalHours - billableHours) * 10) / 10;
      const loggedDays = Number(r.logged_days);
      const avgHoursPerDay = loggedDays > 0 ? Math.round((totalHours / loggedDays) * 10) / 10 : 0;
      const estimatedHours = formatMinutesToHours(Number(r.estimated_minutes));
      const varianceHours = Math.round((totalHours - estimatedHours) * 10) / 10;

      return {
        userId: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        totalHours,
        billableHours,
        nonBillableHours,
        avgHoursPerDay,
        estimatedHours,
        varianceHours,
        loggedDays,
      };
    });

    res.json({
      employees,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/employee/time", req);
  }
});

router.get("/employee/capacity", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);

    const userFilter = filters.userIds.length > 0
      ? sql`AND u.id = ANY(ARRAY[${sql.join(filters.userIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      : sql``;

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      week_start: string;
      planned_minutes: string;
      actual_seconds: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        date_trunc('week', gs.week)::date AS week_start,
        COALESCE(SUM(CASE
          WHEN t.due_date >= gs.week AND t.due_date < gs.week + INTERVAL '7 days'
            AND t.status NOT IN ('done', 'cancelled')
          THEN COALESCE(t.estimate_minutes, 0) ELSE 0
        END), 0) AS planned_minutes,
        COALESCE(SUM(CASE
          WHEN te.start_time >= gs.week AND te.start_time < gs.week + INTERVAL '7 days'
          THEN te.duration_seconds ELSE 0
        END), 0) AS actual_seconds
      FROM users u
      CROSS JOIN generate_series(
        date_trunc('week', ${startDate}::timestamp),
        date_trunc('week', ${endDate}::timestamp),
        '1 week'::interval
      ) AS gs(week)
      LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.user_id = u.id AND te.tenant_id = ${tenantId}
      WHERE u.tenant_id = ${tenantId}
        AND u.role IN ('admin', 'employee')
        ${userFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.email, gs.week
      ORDER BY u.email, week_start
    `);

    const usersMap = new Map<string, {
      userId: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      weeks: Array<{
        weekStart: string;
        plannedHours: number;
        actualHours: number;
        utilizationPct: number;
        overAllocated: boolean;
      }>;
    }>();

    for (const r of rows) {
      if (!usersMap.has(r.user_id)) {
        usersMap.set(r.user_id, {
          userId: r.user_id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          weeks: [],
        });
      }
      const actualHours = Math.round(Number(r.actual_seconds) / 3600 * 10) / 10;
      const plannedHours = Math.round(Number(r.planned_minutes) / 60 * 10) / 10;
      const utilizationPct = Math.round((actualHours / 40) * 100);
      const overAllocated = actualHours > 40;

      usersMap.get(r.user_id)!.weeks.push({
        weekStart: r.week_start,
        plannedHours,
        actualHours,
        utilizationPct,
        overAllocated,
      });
    }

    res.json({
      users: Array.from(usersMap.values()),
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/employee/capacity", req);
  }
});

router.get("/employee/risk", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      avatar_url: string | null;
      active_tasks: string;
      overdue_count: string;
      total_seconds: string;
      backlog_count: string;
      days_in_range: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) AS active_tasks,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_count,
        COALESCE(SUM(CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate} THEN te.duration_seconds ELSE 0 END), 0) AS total_seconds,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled') AND t.updated_at < NOW() - INTERVAL '14 days'
          THEN t.id
        END) AS backlog_count,
        GREATEST(${Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))}, 1) AS days_in_range
      FROM users u
      LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.user_id = u.id AND te.tenant_id = ${tenantId}
      WHERE u.tenant_id = ${tenantId} AND u.role IN ('admin', 'employee')
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
    `);

    const WEEKLY_HOURS_THRESHOLD = 50;
    const HIGH_OVERDUE_RATE = 0.30;
    const LOW_COMPLIANCE_TASK_MIN = 3;
    const HIGH_BACKLOG_MIN = 5;

    const flagged = [];

    for (const r of rows) {
      const activeTasks = Number(r.active_tasks);
      const overdueCount = Number(r.overdue_count);
      const totalSeconds = Number(r.total_seconds);
      const backlogCount = Number(r.backlog_count);
      const daysInRange = Number(r.days_in_range);
      const totalHours = totalSeconds / 3600;
      const weeksInRange = daysInRange / 7;
      const avgHoursPerWeek = weeksInRange > 0 ? totalHours / weeksInRange : 0;
      const overdueRate = activeTasks > 0 ? overdueCount / activeTasks : 0;

      const reasons: string[] = [];
      let score = 0;

      if (avgHoursPerWeek > WEEKLY_HOURS_THRESHOLD) {
        reasons.push(`Overutilization: averaging ${avgHoursPerWeek.toFixed(1)}h/week (threshold: ${WEEKLY_HOURS_THRESHOLD}h)`);
        score += 3;
      }
      if (overdueRate > HIGH_OVERDUE_RATE && overdueCount >= 2) {
        reasons.push(`High overdue rate: ${Math.round(overdueRate * 100)}% of active tasks are overdue`);
        score += 2;
      }
      if (activeTasks >= LOW_COMPLIANCE_TASK_MIN && totalHours < 1) {
        reasons.push(`Low compliance: has ${activeTasks} active tasks but no time entries in range`);
        score += 2;
      }
      if (backlogCount >= HIGH_BACKLOG_MIN) {
        reasons.push(`High backlog: ${backlogCount} tasks not updated in 14+ days`);
        score += 2;
      }

      if (score > 0) {
        flagged.push({
          userId: r.user_id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          avatarUrl: r.avatar_url,
          reasons,
          score,
          metrics: {
            activeTasks,
            overdueCount,
            totalHours: Math.round(totalHours * 10) / 10,
            avgHoursPerWeek: Math.round(avgHoursPerWeek * 10) / 10,
            overdueRate: Math.round(overdueRate * 100),
            backlogCount,
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
    handleRouteError(res, error, "reports-v2/employee/risk", req);
  }
});

router.get("/employee/trends", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);
    const userId = req.query.userId as string | undefined;

    const userFilter = userId
      ? sql`AND ta.user_id = ${userId} AND te.user_id = ${userId}`
      : sql``;

    const userJoinFilter = userId
      ? sql`AND ta.user_id = ${userId}`
      : sql``;

    const timeUserFilter = userId
      ? sql`AND te.user_id = ${userId}`
      : sql``;

    const rows = await db.execute<{
      week_start: string;
      completed_tasks: string;
      hours_tracked: string;
    }>(sql`
      SELECT
        date_trunc('week', gs.week)::date AS week_start,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done'
            AND t.updated_at >= gs.week
            AND t.updated_at < gs.week + INTERVAL '7 days'
          THEN t.id
        END) AS completed_tasks,
        COALESCE(SUM(
          CASE WHEN te.start_time >= gs.week AND te.start_time < gs.week + INTERVAL '7 days'
          THEN te.duration_seconds ELSE 0 END
        ), 0)::float / 3600.0 AS hours_tracked
      FROM generate_series(
        date_trunc('week', ${startDate}::timestamp),
        date_trunc('week', ${endDate}::timestamp),
        '1 week'::interval
      ) AS gs(week)
      LEFT JOIN task_assignees ta ON ta.tenant_id = ${tenantId} ${userJoinFilter}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.tenant_id = ${tenantId} ${timeUserFilter}
      GROUP BY gs.week
      ORDER BY gs.week
    `);

    res.json({
      weeks: rows.map(r => ({
        weekStart: r.week_start,
        completedTasks: Number(r.completed_tasks),
        hoursTracked: Math.round(Number(r.hours_tracked) * 10) / 10,
      })),
      userId: userId ?? null,
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/employee/trends", req);
  }
});

// ── EPI: Employee Performance Index ──────────────────────────────────────────

router.get("/employee/performance", async (req: Request, res: Response) => {
  try {
    const { calculateEmployeePerformance } = await import("../../reports/performance/calculateEmployeePerformance");
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = parseReportRange(req.query as Record<string, unknown>);
    const filters = normalizeFilters(params);
    const { limit, offset } = safePagination(params);

    const userId = filters.userIds.length === 1 ? filters.userIds[0] : null;

    const { results, total } = await calculateEmployeePerformance({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      userId,
      limit,
      offset,
    });

    res.json({
      employees: results,
      pagination: { total, limit, offset },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/employee/performance", req);
  }
});

export default router;
