import { sql } from "drizzle-orm";
import { db } from "../db";
import { getPmPortfolioReport } from "./workSummary";

type ReportingRange = { startDate: Date; endDate: Date };

async function rows<T extends Record<string, unknown>>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const result = await db.execute<T>(query);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

function hours(value: unknown): number {
  return Math.round((Number(value ?? 0) / 3600) * 10) / 10;
}

export function businessDays(startDate: Date, endDate: Date): number {
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function reportMetadata(startDate: Date, endDate: Date) {
  return {
    generatedAt: new Date().toISOString(),
    range: { startDate, endDate },
    semantics: {
      snapshot: "Current state as of the report end date",
      flow: "Events that occurred inside the selected range",
      cumulative: "All recorded activity through the report end date",
    },
    definitions: {
      openTasks: "Non-archived tasks whose current status is not done or cancelled",
      overdueTasks: "Open tasks with a due date before the report end date",
      completedInRange: "Task completion events recorded inside the selected range, including tasks later reopened",
      timeCoverage: "Logged hours divided by configured working capacity; this is not an employee performance score",
    },
    visibility: { mode: "internal", tenantScoped: true },
  };
}

export async function getDeliveryOperationsReport({
  tenantId,
  startDate,
  endDate,
}: { tenantId: string } & ReportingRange) {
  const rangeDuration = Math.max(endDate.getTime() - startDate.getTime(), 86_400_000);
  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = new Date(previousEndDate.getTime() - rangeDuration);
  const [portfolio, previousPortfolio] = await Promise.all([
    getPmPortfolioReport({ tenantId, startDate, endDate }),
    getPmPortfolioReport({ tenantId, startDate: previousStartDate, endDate: previousEndDate }),
  ]);
  const rangeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000);
  const bucket = rangeDays > 120 ? "month" : rangeDays > 45 ? "week" : "day";
  const trendStart = rangeDays > 366
    ? new Date(endDate.getTime() - 366 * 86_400_000)
    : startDate;

  const [flowRows, flowTotalsRows, coverageRows] = await Promise.all([
    rows<{
      bucket: string;
      created: string;
      completed: string;
      reopened: string;
      seconds: string;
    }>(sql`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${bucket}, ${trendStart}::timestamp),
          date_trunc(${bucket}, ${endDate}::timestamp),
          ${bucket === "day" ? sql`INTERVAL '1 day'` : bucket === "week" ? sql`INTERVAL '1 week'` : sql`INTERVAL '1 month'`}
        ) AS bucket
      ), created AS (
        SELECT date_trunc(${bucket}, created_at) AS bucket, COUNT(*) AS count
        FROM tasks
        WHERE tenant_id = ${tenantId} AND archived_at IS NULL
          AND created_at BETWEEN ${trendStart} AND ${endDate}
        GROUP BY 1
      ), completed AS (
        SELECT date_trunc(${bucket}, changed_at) AS bucket, COUNT(*) AS count
        FROM task_status_history
        WHERE tenant_id = ${tenantId} AND to_status = 'done'
          AND changed_at BETWEEN ${trendStart} AND ${endDate}
        GROUP BY 1
      ), reopened AS (
        SELECT date_trunc(${bucket}, changed_at) AS bucket, COUNT(*) AS count
        FROM task_status_history
        WHERE tenant_id = ${tenantId} AND from_status = 'done' AND to_status != 'done'
          AND changed_at BETWEEN ${trendStart} AND ${endDate}
        GROUP BY 1
      ), tracked AS (
        SELECT date_trunc(${bucket}, start_time) AS bucket, SUM(duration_seconds) AS seconds
        FROM time_entries
        WHERE tenant_id = ${tenantId} AND start_time BETWEEN ${trendStart} AND ${endDate}
        GROUP BY 1
      )
      SELECT b.bucket::text,
        COALESCE(c.count, 0)::text AS created,
        COALESCE(d.count, 0)::text AS completed,
        COALESCE(r.count, 0)::text AS reopened,
        COALESCE(t.seconds, 0)::text AS seconds
      FROM buckets b
      LEFT JOIN created c ON c.bucket = b.bucket
      LEFT JOIN completed d ON d.bucket = b.bucket
      LEFT JOIN reopened r ON r.bucket = b.bucket
      LEFT JOIN tracked t ON t.bucket = b.bucket
      ORDER BY b.bucket
    `),
    rows<{ created: string; completed: string; reopened: string; blocked: string; previous_created: string; previous_completed: string; previous_reopened: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at BETWEEN ${startDate} AND ${endDate})::text AS created,
        (SELECT COUNT(*) FROM task_status_history
          WHERE tenant_id = ${tenantId} AND to_status = 'done'
            AND changed_at BETWEEN ${startDate} AND ${endDate})::text AS completed,
        (SELECT COUNT(*) FROM task_status_history
          WHERE tenant_id = ${tenantId} AND from_status = 'done' AND to_status != 'done'
            AND changed_at BETWEEN ${startDate} AND ${endDate})::text AS reopened,
        COUNT(*) FILTER (WHERE created_at BETWEEN ${previousStartDate} AND ${previousEndDate})::text AS previous_created,
        (SELECT COUNT(*) FROM task_status_history
          WHERE tenant_id = ${tenantId} AND to_status = 'done'
            AND changed_at BETWEEN ${previousStartDate} AND ${previousEndDate})::text AS previous_completed,
        (SELECT COUNT(*) FROM task_status_history
          WHERE tenant_id = ${tenantId} AND from_status = 'done' AND to_status != 'done'
            AND changed_at BETWEEN ${previousStartDate} AND ${previousEndDate})::text AS previous_reopened,
        COUNT(*) FILTER (WHERE status = 'blocked' AND archived_at IS NULL)::text AS blocked
      FROM tasks WHERE tenant_id = ${tenantId}
    `),
    rows<{ open_tasks: string; estimated_tasks: string; active_projects: string; budgeted_projects: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL)::text AS open_tasks,
        COUNT(*) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL AND t.estimate_minutes > 0)::text AS estimated_tasks,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')::text AS active_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active' AND p.budget_minutes > 0)::text AS budgeted_projects
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
      WHERE t.tenant_id = ${tenantId}
    `),
  ]);

  const flowTotals = flowTotalsRows[0] ?? { created: "0", completed: "0", reopened: "0", blocked: "0", previous_created: "0", previous_completed: "0", previous_reopened: "0" };
  const coverage = coverageRows[0] ?? { open_tasks: "0", estimated_tasks: "0", active_projects: "0", budgeted_projects: "0" };
  const openTasks = Number(coverage.open_tasks);
  const activeProjects = Number(coverage.active_projects);

  return {
    metadata: reportMetadata(startDate, endDate),
    snapshot: portfolio.totals,
    flow: {
      created: Number(flowTotals.created),
      completed: Number(flowTotals.completed),
      reopened: Number(flowTotals.reopened),
      blockedNow: Number(flowTotals.blocked),
      buckets: flowRows.map((row) => ({
        date: row.bucket,
        created: Number(row.created),
        completed: Number(row.completed),
        reopened: Number(row.reopened),
        hours: hours(row.seconds),
      })),
    },
    comparison: {
      rangeHoursDelta: Math.round((portfolio.totals.rangeHours - previousPortfolio.totals.rangeHours) * 10) / 10,
      createdDelta: Number(flowTotals.created) - Number(flowTotals.previous_created),
      completedDelta: Number(flowTotals.completed) - Number(flowTotals.previous_completed),
      reopenedDelta: Number(flowTotals.reopened) - Number(flowTotals.previous_reopened),
      previousRange: { startDate: previousStartDate, endDate: previousEndDate },
    },
    coverage: {
      estimatePct: openTasks > 0 ? Math.round(Number(coverage.estimated_tasks) / openTasks * 100) : 100,
      budgetPct: activeProjects > 0 ? Math.round(Number(coverage.budgeted_projects) / activeProjects * 100) : 100,
    },
    attentionQueue: portfolio.attentionQueue,
    projects: portfolio.projects,
    clients: portfolio.clients,
  };
}

export async function getPeopleCapacityReport({
  tenantId,
  startDate,
  endDate,
}: { tenantId: string } & ReportingRange) {
  const workDays = businessDays(startDate, endDate);
  const [peopleRows, unassignedRows] = await Promise.all([rows<{
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    avatar_url: string | null;
    capacity_minutes: string;
    capacity_adjustment_minutes: string;
    active_tasks: string;
    overdue_tasks: string;
    completed_in_range: string;
    estimated_minutes: string;
    estimated_task_count: string;
    active_task_count: string;
    logged_seconds: string;
    project_count: string;
    project_ids: string[];
  }>(sql`
    WITH member_capacity AS (
      SELECT wm.user_id, MAX(wm.weekly_capacity_minutes) AS capacity_minutes
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE w.tenant_id = ${tenantId} AND wm.status = 'active'
      GROUP BY wm.user_id
    ), capacity_exception AS (
      SELECT mce.user_id,
        SUM(mce.available_minutes - COALESCE(mc.capacity_minutes, 2400) / 5.0) AS adjustment_minutes
      FROM member_capacity_exceptions mce
      LEFT JOIN member_capacity mc ON mc.user_id = mce.user_id
      WHERE mce.tenant_id = ${tenantId}
        AND mce.capacity_date BETWEEN ${startDate}::date AND ${endDate}::date
        AND EXTRACT(ISODOW FROM mce.capacity_date) BETWEEN 1 AND 5
      GROUP BY mce.user_id
    ), task_rollup AS (
      SELECT ta.user_id,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL) AS active_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL AND t.due_date < ${endDate}) AS overdue_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM task_status_history tsh
          WHERE tsh.task_id = t.id AND tsh.tenant_id = ${tenantId} AND tsh.to_status = 'done'
            AND tsh.changed_at BETWEEN ${startDate} AND ${endDate}
        )) AS completed_in_range,
        COALESCE(SUM(t.estimate_minutes) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL), 0) AS estimated_minutes,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL AND t.estimate_minutes > 0) AS estimated_task_count,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL) AS active_task_count,
        COUNT(DISTINCT t.project_id) FILTER (WHERE t.status NOT IN ('done','cancelled') AND t.archived_at IS NULL) AS project_count
        , ARRAY_REMOVE(ARRAY_AGG(DISTINCT t.project_id), NULL) AS project_ids
      FROM task_assignees ta
      JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
      WHERE ta.tenant_id = ${tenantId}
      GROUP BY ta.user_id
    ), time_rollup AS (
      SELECT user_id, COALESCE(SUM(duration_seconds), 0) AS logged_seconds
      FROM time_entries
      WHERE tenant_id = ${tenantId} AND start_time BETWEEN ${startDate} AND ${endDate}
      GROUP BY user_id
    )
    SELECT u.id AS user_id, u.first_name, u.last_name, u.email, u.avatar_url,
      COALESCE(mc.capacity_minutes, 2400)::text AS capacity_minutes,
      COALESCE(ce.adjustment_minutes, 0)::text AS capacity_adjustment_minutes,
      COALESCE(tr.active_tasks, 0)::text AS active_tasks,
      COALESCE(tr.overdue_tasks, 0)::text AS overdue_tasks,
      COALESCE(tr.completed_in_range, 0)::text AS completed_in_range,
      COALESCE(tr.estimated_minutes, 0)::text AS estimated_minutes,
      COALESCE(tr.estimated_task_count, 0)::text AS estimated_task_count,
      COALESCE(tr.active_task_count, 0)::text AS active_task_count,
      COALESCE(tmr.logged_seconds, 0)::text AS logged_seconds,
      COALESCE(tr.project_count, 0)::text AS project_count
      , COALESCE(tr.project_ids, ARRAY[]::varchar[]) AS project_ids
    FROM users u
    LEFT JOIN member_capacity mc ON mc.user_id = u.id
    LEFT JOIN capacity_exception ce ON ce.user_id = u.id
    LEFT JOIN task_rollup tr ON tr.user_id = u.id
    LEFT JOIN time_rollup tmr ON tmr.user_id = u.id
    WHERE u.tenant_id = ${tenantId} AND u.is_active = true
      AND u.role IN ('admin','project_manager','employee')
    ORDER BY overdue_tasks DESC, active_tasks DESC, u.first_name, u.last_name
  `), rows<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM tasks t
    WHERE t.tenant_id = ${tenantId} AND t.archived_at IS NULL
      AND t.status NOT IN ('done','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId}
      )
  `)]);

  const people = peopleRows.map((row) => {
    const weeklyCapacityHours = Number(row.capacity_minutes) / 60;
    const capacityHours = Math.max(0, Math.round((weeklyCapacityHours * workDays / 5 + Number(row.capacity_adjustment_minutes) / 60) * 10) / 10);
    const plannedHours = Math.round((Number(row.estimated_minutes) / 60) * 10) / 10;
    const loggedHours = hours(row.logged_seconds);
    const activeTasks = Number(row.active_task_count);
    const plannedLoadPct = capacityHours > 0 ? Math.round(plannedHours / capacityHours * 100) : null;
    const timeCoveragePct = capacityHours > 0 ? Math.round(loggedHours / capacityHours * 100) : null;
    return {
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      weeklyCapacityHours,
      capacityHours,
      plannedHours,
      loggedHours,
      plannedLoadPct,
      timeCoveragePct,
      activeTasks,
      overdueTasks: Number(row.overdue_tasks),
      completedInRange: Number(row.completed_in_range),
      projectCount: Number(row.project_count),
      projectIds: row.project_ids ?? [],
      estimateCoveragePct: activeTasks > 0 ? Math.round(Number(row.estimated_task_count) / activeTasks * 100) : 100,
      loadState: plannedLoadPct === null ? "unknown" : plannedLoadPct > 110 ? "overloaded" : plannedLoadPct < 50 ? "underallocated" : "balanced",
    };
  });

  const totalCapacity = people.reduce((sum, person) => sum + person.capacityHours, 0);
  const totalPlanned = people.reduce((sum, person) => sum + person.plannedHours, 0);
  const totalLogged = people.reduce((sum, person) => sum + person.loggedHours, 0);
  const activeTasks = people.reduce((sum, person) => sum + person.activeTasks, 0);

  return {
    metadata: reportMetadata(startDate, endDate),
    summary: {
      people: people.length,
      capacityHours: Math.round(totalCapacity * 10) / 10,
      plannedHours: Math.round(totalPlanned * 10) / 10,
      loggedHours: Math.round(totalLogged * 10) / 10,
      plannedLoadPct: totalCapacity > 0 ? Math.round(totalPlanned / totalCapacity * 100) : null,
      timeCoveragePct: totalCapacity > 0 ? Math.round(totalLogged / totalCapacity * 100) : null,
      overdueTasks: people.reduce((sum, person) => sum + person.overdueTasks, 0),
      overloadedPeople: people.filter((person) => person.loadState === "overloaded").length,
      unassignedTasks: Number(unassignedRows[0]?.count ?? 0),
      estimateCoveragePct: activeTasks > 0
        ? Math.round(people.reduce((sum, person) => sum + person.activeTasks * person.estimateCoveragePct, 0) / activeTasks)
        : 100,
    },
    people,
  };
}
