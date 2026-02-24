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
  formatHours,
  formatMinutesToHours,
} from "../../reports/utils";

const router = Router();

router.use(reportingGuard);

function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

router.get("/workload/team", async (req: Request, res: Response) => {
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
      avatar_url: string | null;
      active_tasks_now: string;
      overdue_count: string;
      completed_count: string;
      total_hours: string;
      estimated_minutes: string;
      due_soon_count: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled')
          THEN t.id
        END) AS active_tasks_now,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW()
          THEN t.id
        END) AS overdue_count,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done'
            AND t.updated_at >= ${startDate}
            AND t.updated_at <= ${endDate}
          THEN t.id
        END) AS completed_count,
        COALESCE(SUM(
          CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
          THEN te.duration_seconds ELSE 0 END
        ), 0)::float / 3600.0 AS total_hours,
        COALESCE(SUM(
          CASE WHEN t.status NOT IN ('done', 'cancelled')
          THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END
        ), 0) AS estimated_minutes,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done', 'cancelled')
            AND t.due_date > NOW()
            AND t.due_date <= NOW() + INTERVAL '7 days'
          THEN t.id
        END) AS due_soon_count
      FROM users u
      LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.user_id = u.id AND te.tenant_id = ${tenantId}
      WHERE u.tenant_id = ${tenantId}
        AND u.role IN ('admin', 'employee')
        ${userFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
      ORDER BY active_tasks_now DESC, overdue_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRow = firstRow(await db.execute<{ total: string }>(sql`
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      WHERE u.tenant_id = ${tenantId} AND u.role IN ('admin', 'employee')
      ${userFilter}
    `));

    const team = rows.map((r) => {
      const activeTasks = Number(r.active_tasks_now);
      const overdueCount = Number(r.overdue_count);
      const completedCount = Number(r.completed_count);
      const totalHours = Math.round(Number(r.total_hours) * 10) / 10;
      const estimatedMinutes = Number(r.estimated_minutes);
      const estimatedHours = formatMinutesToHours(estimatedMinutes);
      const efficiencyRatio = estimatedHours > 0
        ? Math.round((totalHours / estimatedHours) * 100) / 100
        : null;
      const overdueRate = activeTasks + completedCount > 0
        ? Math.round((overdueCount / (activeTasks + completedCount)) * 100)
        : 0;

      return {
        userId: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        avatarUrl: r.avatar_url,
        activeTasksNow: activeTasks,
        overdueCount,
        completedCount,
        dueSoonCount: Number(r.due_soon_count),
        totalHours,
        estimatedHours,
        efficiencyRatio,
        overdueRate,
      };
    });

    res.json({
      team,
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/workload/team", req);
  }
});

router.get("/workload/users/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { userId } = req.params;
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);

    const userRow = firstRow(await db.execute<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      avatar_url: string | null;
    }>(sql`
      SELECT id, first_name, last_name, email, avatar_url
      FROM users WHERE id = ${userId} AND tenant_id = ${tenantId} LIMIT 1
    `));

    if (!userRow) {
      return res.status(404).json({ error: "User not found" });
    }

    const summaryRow = firstRow(await db.execute<{
      active_tasks: string;
      overdue_count: string;
      completed_count: string;
      total_hours: string;
      due_soon: string;
    }>(sql`
      SELECT
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) AS active_tasks,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_count,
        COUNT(DISTINCT CASE WHEN t.status='done' AND t.updated_at BETWEEN ${startDate} AND ${endDate} THEN t.id END) AS completed_count,
        COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0)::float / 3600.0 AS total_hours,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date > NOW() AND t.due_date <= NOW() + INTERVAL '7 days' THEN t.id END) AS due_soon
      FROM users u
      LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.user_id = u.id AND te.tenant_id = ${tenantId}
      WHERE u.id = ${userId} AND u.tenant_id = ${tenantId}
    `));

    const dailyTrend = await db.execute<{
      day: string;
      completed_tasks: string;
      hours_tracked: string;
    }>(sql`
      SELECT
        gs.day::date AS day,
        COUNT(DISTINCT CASE WHEN t.status='done' AND t.updated_at::date = gs.day::date THEN t.id END) AS completed_tasks,
        COALESCE(SUM(CASE WHEN te.start_time::date = gs.day::date THEN te.duration_seconds ELSE 0 END), 0)::float / 3600.0 AS hours_tracked
      FROM generate_series(${startDate}::date, ${endDate}::date, '1 day'::interval) AS gs(day)
      LEFT JOIN task_assignees ta ON ta.tenant_id = ${tenantId} AND ta.user_id = ${userId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.user_id = ${userId} AND te.tenant_id = ${tenantId}
      GROUP BY gs.day
      ORDER BY gs.day
    `);

    const topProjects = await db.execute<{
      project_id: string;
      project_name: string;
      hours_tracked: string;
      task_count: string;
    }>(sql`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        COALESCE(SUM(te.duration_seconds), 0)::float / 3600.0 AS hours_tracked,
        COUNT(DISTINCT t.id) AS task_count
      FROM projects p
      LEFT JOIN time_entries te ON te.project_id = p.id AND te.user_id = ${userId}
        AND te.tenant_id = ${tenantId} AND te.start_time BETWEEN ${startDate} AND ${endDate}
      LEFT JOIN task_assignees ta ON ta.user_id = ${userId} AND ta.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = ta.task_id AND t.project_id = p.id AND t.tenant_id = ${tenantId}
      WHERE p.tenant_id = ${tenantId}
      GROUP BY p.id, p.name
      HAVING COALESCE(SUM(te.duration_seconds), 0) > 0 OR COUNT(DISTINCT t.id) > 0
      ORDER BY hours_tracked DESC
      LIMIT 5
    `);

    const overdueTaskSample = await db.execute<{
      id: string;
      title: string;
      due_date: string;
      priority: string;
      project_name: string;
    }>(sql`
      SELECT t.id, t.title, t.due_date, t.priority, p.name AS project_name
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id AND ta.user_id = ${userId}
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.tenant_id = ${tenantId}
        AND ta.user_id = ${userId}
        AND t.status NOT IN ('done', 'cancelled')
        AND t.due_date < NOW()
      ORDER BY t.due_date ASC
      LIMIT 10
    `);

    res.json({
      user: {
        id: userRow.id,
        firstName: userRow.first_name,
        lastName: userRow.last_name,
        email: userRow.email,
        avatarUrl: userRow.avatar_url,
      },
      summary: {
        activeTasksNow: Number(summaryRow?.active_tasks ?? 0),
        overdueCount: Number(summaryRow?.overdue_count ?? 0),
        completedCount: Number(summaryRow?.completed_count ?? 0),
        totalHours: Math.round(Number(summaryRow?.total_hours ?? 0) * 10) / 10,
        dueSoonCount: Number(summaryRow?.due_soon ?? 0),
      },
      dailyTrend: dailyTrend.map(r => ({
        day: r.day,
        completedTasks: Number(r.completed_tasks),
        hoursTracked: Math.round(Number(r.hours_tracked) * 10) / 10,
      })),
      topProjects: topProjects.map(r => ({
        projectId: r.project_id,
        projectName: r.project_name,
        hoursTracked: Math.round(Number(r.hours_tracked) * 10) / 10,
        taskCount: Number(r.task_count),
      })),
      overdueTaskSample: overdueTaskSample.map(r => ({
        id: r.id,
        title: r.title,
        dueDate: r.due_date,
        priority: r.priority,
        projectName: r.project_name,
      })),
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/workload/users/:userId", req);
  }
});

router.get("/workload/capacity", async (req: Request, res: Response) => {
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
      estimated_minutes: string;
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
            AND t.status NOT IN ('done','cancelled')
          THEN COALESCE(t.estimate_minutes, 0) ELSE 0
        END), 0) AS estimated_minutes,
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
        estimatedHours: number;
        actualHours: number;
        utilizationPct: number | null;
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
      const estimatedHours = Math.round(Number(r.estimated_minutes) / 60 * 10) / 10;
      const availableHours = 40;
      const utilizationPct = actualHours > 0
        ? Math.round((actualHours / availableHours) * 100)
        : null;

      usersMap.get(r.user_id)!.weeks.push({
        weekStart: r.week_start,
        estimatedHours,
        actualHours,
        utilizationPct,
      });
    }

    res.json({
      users: Array.from(usersMap.values()),
      range: { startDate, endDate },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v2/workload/capacity", req);
  }
});

router.get("/workload/risk", async (req: Request, res: Response) => {
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
        COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0) AS total_seconds,
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
    const NO_TIME_LOG_TASK_MIN = 3;

    const flagged = [];

    for (const r of rows) {
      const activeTasks = Number(r.active_tasks);
      const overdueCount = Number(r.overdue_count);
      const totalSeconds = Number(r.total_seconds);
      const daysInRange = Number(r.days_in_range);
      const totalHours = totalSeconds / 3600;
      const weeksInRange = daysInRange / 7;
      const avgHoursPerWeek = weeksInRange > 0 ? totalHours / weeksInRange : 0;
      const overdueRate = activeTasks > 0 ? overdueCount / activeTasks : 0;

      const reasons: string[] = [];
      let score = 0;

      if (avgHoursPerWeek > WEEKLY_HOURS_THRESHOLD) {
        reasons.push(`High workload: averaging ${avgHoursPerWeek.toFixed(1)}h/week (threshold: ${WEEKLY_HOURS_THRESHOLD}h)`);
        score += 3;
      }
      if (overdueRate > HIGH_OVERDUE_RATE && overdueCount >= 2) {
        reasons.push(`High overdue rate: ${Math.round(overdueRate * 100)}% of active tasks are overdue`);
        score += 2;
      }
      if (activeTasks >= NO_TIME_LOG_TASK_MIN && totalHours < 1) {
        reasons.push(`No time logged: has ${activeTasks} active tasks but no time entries in range`);
        score += 2;
      }
      if (overdueCount >= 5) {
        reasons.push(`Critical overdue: ${overdueCount} tasks past due date`);
        score += 2;
      }

      if (reasons.length > 0) {
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
    handleRouteError(res, error, "reports-v2/workload/risk", req);
  }
});

export default router;
