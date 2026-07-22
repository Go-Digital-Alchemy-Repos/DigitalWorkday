import { sql } from "drizzle-orm";
import { db } from "../db";

const BILLABLE_TIME_SQL = sql`te.scope = 'out_of_scope'`;
const OPEN_TASK_SQL = sql`t.status NOT IN ('done', 'cancelled') AND t.archived_at IS NULL`;
const DONE_TASK_SQL = sql`t.status = 'done' AND t.archived_at IS NULL`;

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as T[];
}

function hours(seconds: unknown): number {
  return Math.round((Number(seconds ?? 0) / 3600) * 10) / 10;
}

function estimateHours(minutes: unknown): number {
  return Math.round((Number(minutes ?? 0) / 60) * 10) / 10;
}

function startOfYear(referenceDate: Date): Date {
  return new Date(referenceDate.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function startOfLifetime(): Date {
  return new Date("1970-01-01T00:00:00.000Z");
}

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

export function calculateWorkVariance({
  lifetimeSeconds,
  estimatedMinutes,
  budgetMinutes,
}: {
  lifetimeSeconds: unknown;
  estimatedMinutes: unknown;
  budgetMinutes: unknown;
}) {
  const lifetimeHours = hours(lifetimeSeconds);
  const estimatedTotalHours = estimateHours(estimatedMinutes);
  const budgetHours = estimateHours(budgetMinutes);
  return {
    lifetimeHours,
    estimatedTotalHours,
    budgetHours,
    varianceHours: Math.round((lifetimeHours - estimatedTotalHours) * 10) / 10,
    budgetVarianceHours: budgetHours > 0 ? Math.round((lifetimeHours - budgetHours) * 10) / 10 : null,
  };
}

export function calculateCompletionPercent(completedTasks: unknown, totalTasks: unknown): number {
  const completed = Number(completedTasks ?? 0);
  const total = Number(totalTasks ?? 0);
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function toClientSafeWorkSummary<T extends Record<string, any>>(report: T): T {
  const totals = { ...(report.totals ?? {}) };
  delete totals.billableHours;
  delete totals.nonBillableHours;
  delete totals.varianceHours;
  delete totals.budgetVarianceHours;

  const projects = Array.isArray(report.projects)
    ? report.projects.map((project: Record<string, any>) => {
        const safeProject = { ...project };
        delete safeProject.varianceHours;
        delete safeProject.budgetVarianceHours;
        delete safeProject.riskReasons;
        return safeProject;
      })
    : report.projects;
  const contributors = Array.isArray(report.contributors)
    ? report.contributors.map(({ email: _email, ...contributor }: Record<string, any>) => contributor)
    : report.contributors;
  const recentEntries = Array.isArray(report.recentEntries)
    ? report.recentEntries.map(({ scope: _scope, ...entry }: Record<string, any>) => entry)
    : report.recentEntries;

  return {
    ...report,
    totals,
    projects,
    contributors,
    recentEntries,
    visibility: {
      mode: "client_safe",
      clientSafeAvailable: true,
      hiddenFromClient: report.visibility?.hiddenFromClient ?? [],
    },
  };
}

export interface WorkSummaryRange {
  startDate: Date;
  endDate: Date;
}

function clientTimeAttributionCondition(tenantId: string, clientId: string) {
  return sql`COALESCE(
    (SELECT p.client_id FROM projects p WHERE p.id = te.project_id AND p.tenant_id = ${tenantId} LIMIT 1),
    te.client_id
  ) = ${clientId}`;
}

function csvCell(value: unknown): string {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

export async function getClientWorkSummaryCsv({
  tenantId,
  clientId,
  startDate,
  endDate,
}: {
  tenantId: string;
  clientId: string;
} & WorkSummaryRange): Promise<string | null> {
  const clientResult = rows<{ id: string }>(await db.execute(sql`
    SELECT id FROM clients WHERE tenant_id = ${tenantId} AND id = ${clientId} LIMIT 1
  `));
  if (!clientResult[0]) return null;

  const entries = rows<any>(await db.execute(sql`
    SELECT
      te.start_time,
      te.title,
      p.name AS project_name,
      t.title AS task_title,
      COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.name, u.email) AS user_name,
      te.duration_seconds,
      te.scope
    FROM time_entries te
    LEFT JOIN projects p ON p.id = te.project_id AND p.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.id = te.task_id AND t.tenant_id = ${tenantId}
    JOIN users u ON u.id = te.user_id
    WHERE te.tenant_id = ${tenantId}
      AND ${clientTimeAttributionCondition(tenantId, clientId)}
      AND te.start_time BETWEEN ${startDate} AND ${endDate}
    ORDER BY te.start_time DESC, te.id DESC
  `));

  const header = ["Date", "Title", "Project", "Task", "Employee", "Duration Seconds", "Billable", "Scope"];
  const csvRows = entries.map((entry) => [
    entry.start_time instanceof Date ? entry.start_time.toISOString() : entry.start_time,
    entry.title ?? "Untitled",
    entry.project_name,
    entry.task_title,
    entry.user_name,
    Number(entry.duration_seconds ?? 0),
    entry.scope === "out_of_scope" ? "Yes" : "No",
    entry.scope,
  ].map(csvCell).join(","));

  return [header.map(csvCell).join(","), ...csvRows].join("\n");
}

export async function getClientWorkSummaryReport({
  tenantId,
  clientId,
  startDate,
  endDate,
}: {
  tenantId: string;
  clientId: string;
} & WorkSummaryRange) {
  const ytdStart = startOfYear(endDate);
  const lifetimeStart = startOfLifetime();

  const clientResult = await db.execute<{
    id: string;
    company_name: string;
    display_name: string | null;
    status: string | null;
    stage: string | null;
    created_at: string;
  }>(sql`
    SELECT id, company_name, display_name, status, stage, created_at
    FROM clients
    WHERE tenant_id = ${tenantId} AND id = ${clientId}
    LIMIT 1
  `);
  const client = rows<any>(clientResult)[0];
  if (!client) return null;

  const totalsResult = await db.execute<{
    range_seconds: string;
    range_billable_seconds: string;
    ytd_seconds: string;
    lifetime_seconds: string;
    range_entries: string;
    active_projects: string;
    open_tasks: string;
    overdue_tasks: string;
    completed_in_range: string;
    estimated_minutes_open: string;
    estimated_minutes_total: string;
    budget_minutes: string;
    last_activity_at: string | null;
  }>(sql`
    SELECT
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0)
        FROM time_entries te
        WHERE te.tenant_id = ${tenantId}
          AND ${clientTimeAttributionCondition(tenantId, clientId)}
          AND te.start_time BETWEEN ${startDate} AND ${endDate}
      ) AS range_seconds,
      (
        SELECT COALESCE(SUM(CASE WHEN ${BILLABLE_TIME_SQL} THEN te.duration_seconds ELSE 0 END), 0)
        FROM time_entries te
        WHERE te.tenant_id = ${tenantId}
          AND ${clientTimeAttributionCondition(tenantId, clientId)}
          AND te.start_time BETWEEN ${startDate} AND ${endDate}
      ) AS range_billable_seconds,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0)
        FROM time_entries te
        WHERE te.tenant_id = ${tenantId}
          AND ${clientTimeAttributionCondition(tenantId, clientId)}
          AND te.start_time BETWEEN ${ytdStart} AND ${endDate}
      ) AS ytd_seconds,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0)
        FROM time_entries te
        WHERE te.tenant_id = ${tenantId}
          AND ${clientTimeAttributionCondition(tenantId, clientId)}
          AND te.start_time BETWEEN ${lifetimeStart} AND ${endDate}
      ) AS lifetime_seconds,
      (
        SELECT COUNT(*) FROM time_entries te
        WHERE te.tenant_id = ${tenantId}
          AND ${clientTimeAttributionCondition(tenantId, clientId)}
          AND te.start_time BETWEEN ${startDate} AND ${endDate}
      ) AS range_entries,
      (
        SELECT COUNT(*) FROM projects p
        WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId} AND p.status = 'active'
      ) AS active_projects,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
        WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId} AND ${OPEN_TASK_SQL}
      ) AS open_tasks,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
        WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId} AND ${OPEN_TASK_SQL} AND t.due_date < NOW()
      ) AS overdue_tasks,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
        WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId} AND ${DONE_TASK_SQL}
          AND t.updated_at BETWEEN ${startDate} AND ${endDate}
      ) AS completed_in_range,
      (
        SELECT COALESCE(SUM(COALESCE(t.estimate_minutes, 0)), 0)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
        WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId} AND ${OPEN_TASK_SQL}
      ) AS estimated_minutes_open,
      (
        SELECT COALESCE(SUM(COALESCE(t.estimate_minutes, 0)), 0)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
        WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId} AND t.archived_at IS NULL
      ) AS estimated_minutes_total,
      (
        SELECT COALESCE(SUM(COALESCE(p.budget_minutes, 0)), 0)
        FROM projects p
        WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId}
      ) AS budget_minutes,
      GREATEST(
        (SELECT MAX(t.updated_at) FROM projects p JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId}),
        (SELECT MAX(te.start_time) FROM time_entries te WHERE te.tenant_id = ${tenantId} AND ${clientTimeAttributionCondition(tenantId, clientId)})
      ) AS last_activity_at
  `);
  const totals = rows<any>(totalsResult)[0] ?? {};

  const projectRows = rows<any>(await db.execute(sql`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.status,
      p.division_id,
      p.budget_minutes,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
      ) AS total_tasks,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${OPEN_TASK_SQL}
      ) AS open_tasks,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${OPEN_TASK_SQL} AND t.due_date < NOW()
      ) AS overdue_tasks,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${DONE_TASK_SQL}
      ) AS completed_tasks,
      (
        SELECT COALESCE(SUM(COALESCE(t.estimate_minutes, 0)), 0)
        FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${OPEN_TASK_SQL}
      ) AS estimated_minutes_open,
      (
        SELECT COALESCE(SUM(COALESCE(t.estimate_minutes, 0)), 0)
        FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
      ) AS estimated_minutes_total,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0)
        FROM time_entries te
        WHERE te.project_id = p.id AND te.tenant_id = ${tenantId} AND te.start_time BETWEEN ${startDate} AND ${endDate}
      ) AS range_seconds,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0)
        FROM time_entries te
        WHERE te.project_id = p.id AND te.tenant_id = ${tenantId} AND te.start_time BETWEEN ${ytdStart} AND ${endDate}
      ) AS ytd_seconds,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0)
        FROM time_entries te
        WHERE te.project_id = p.id AND te.tenant_id = ${tenantId} AND te.start_time <= ${endDate}
      ) AS lifetime_seconds,
      GREATEST(
        (SELECT MAX(t.updated_at) FROM tasks t WHERE t.project_id = p.id AND t.tenant_id = ${tenantId}),
        (SELECT MAX(te.start_time) FROM time_entries te WHERE te.project_id = p.id AND te.tenant_id = ${tenantId})
      ) AS last_activity_at
    FROM projects p
    WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId}
    ORDER BY range_seconds DESC, open_tasks DESC, p.name ASC
  `));

  const taskRows = rows<any>(await db.execute(sql`
    SELECT
      t.id AS task_id,
      t.title,
      t.status,
      t.priority,
      t.due_date,
      t.estimate_minutes,
      p.id AS project_id,
      p.name AS project_name,
      COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time BETWEEN ${startDate} AND ${endDate}), 0) AS range_seconds,
      COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time <= ${endDate}), 0) AS lifetime_seconds,
      MAX(te.start_time) AS last_time_at
    FROM projects p
    JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    LEFT JOIN time_entries te ON te.task_id = t.id AND te.tenant_id = ${tenantId}
    WHERE p.tenant_id = ${tenantId} AND p.client_id = ${clientId}
    GROUP BY t.id, t.title, t.status, t.priority, t.due_date, t.estimate_minutes, p.id, p.name
    ORDER BY range_seconds DESC, t.due_date ASC NULLS LAST, t.updated_at DESC
    LIMIT 200
  `));

  const contributorRows = rows<any>(await db.execute(sql`
    SELECT
      u.id AS user_id,
      COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.name, u.email) AS name,
      u.email,
      COALESCE(SUM(te.duration_seconds), 0) AS range_seconds,
      COUNT(te.id) AS entries
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.tenant_id = ${tenantId}
      AND ${clientTimeAttributionCondition(tenantId, clientId)}
      AND te.start_time BETWEEN ${startDate} AND ${endDate}
    GROUP BY u.id, u.first_name, u.last_name, u.name, u.email
    ORDER BY range_seconds DESC
    LIMIT 25
  `));

  const recentEntries = rows<any>(await db.execute(sql`
    SELECT
      te.id,
      te.title,
      te.scope,
      te.start_time,
      te.end_time,
      te.duration_seconds,
      p.id AS project_id,
      p.name AS project_name,
      t.id AS task_id,
      t.title AS task_title,
      COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.name, u.email) AS user_name
    FROM time_entries te
    LEFT JOIN projects p ON p.id = te.project_id
    LEFT JOIN tasks t ON t.id = te.task_id
    JOIN users u ON u.id = te.user_id
    WHERE te.tenant_id = ${tenantId}
      AND ${clientTimeAttributionCondition(tenantId, clientId)}
      AND te.start_time BETWEEN ${startDate} AND ${endDate}
    ORDER BY te.start_time DESC
    LIMIT 50
  `));

  const rangeHours = hours(totals.range_seconds);
  const billableHours = hours(totals.range_billable_seconds);
  const estimatedOpenHours = estimateHours(totals.estimated_minutes_open);
  const budgetHours = estimateHours(totals.budget_minutes);

  return {
    client: {
      id: client.id,
      companyName: client.company_name,
      displayName: client.display_name,
      status: client.status,
      stage: client.stage,
      createdAt: client.created_at,
    },
    range: { startDate, endDate },
    visibility: {
      mode: "internal",
      clientSafeAvailable: true,
      hiddenFromClient: ["billableHours", "nonBillableHours", "varianceHours", "riskLanguage"],
    },
    totals: {
      rangeHours,
      billableHours,
      nonBillableHours: Math.round((rangeHours - billableHours) * 10) / 10,
      ytdHours: hours(totals.ytd_seconds),
      lifetimeHours: hours(totals.lifetime_seconds),
      timeEntries: Number(totals.range_entries ?? 0),
      activeProjects: Number(totals.active_projects ?? 0),
      openTasks: Number(totals.open_tasks ?? 0),
      overdueTasks: Number(totals.overdue_tasks ?? 0),
      completedInRange: Number(totals.completed_in_range ?? 0),
      estimatedOpenHours,
      estimatedTotalHours: estimateHours(totals.estimated_minutes_total),
      budgetHours,
      varianceHours: Math.round((hours(totals.lifetime_seconds) - estimateHours(totals.estimated_minutes_total)) * 10) / 10,
      lastActivityAt: totals.last_activity_at ?? null,
      inactivityDays: daysSince(totals.last_activity_at ?? null),
    },
    projects: projectRows.map((r) => {
      const projectRangeHours = hours(r.range_seconds);
      const variance = calculateWorkVariance({
        lifetimeSeconds: r.lifetime_seconds,
        estimatedMinutes: r.estimated_minutes_total,
        budgetMinutes: r.budget_minutes,
      });
      const openTasks = Number(r.open_tasks ?? 0);
      const completedTasks = Number(r.completed_tasks ?? 0);
      const totalTasks = Number(r.total_tasks ?? 0);
      return {
        projectId: r.project_id,
        projectName: r.project_name,
        status: r.status,
        divisionId: r.division_id,
        totalTasks,
        openTasks,
        overdueTasks: Number(r.overdue_tasks ?? 0),
        completedTasks,
        completionPercent: calculateCompletionPercent(completedTasks, totalTasks),
        rangeHours: projectRangeHours,
        ytdHours: hours(r.ytd_seconds),
        lifetimeHours: variance.lifetimeHours,
        estimatedOpenHours: estimateHours(r.estimated_minutes_open),
        estimatedTotalHours: variance.estimatedTotalHours,
        budgetHours: variance.budgetHours,
        budgetVarianceHours: variance.budgetVarianceHours,
        lastActivityAt: r.last_activity_at ?? null,
      };
    }),
    tasks: taskRows.map((r) => ({
      taskId: r.task_id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date,
      projectId: r.project_id,
      projectName: r.project_name,
      estimateHours: estimateHours(r.estimate_minutes),
      rangeHours: hours(r.range_seconds),
      lifetimeHours: hours(r.lifetime_seconds),
      lastTimeAt: r.last_time_at,
    })),
    contributors: contributorRows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      rangeHours: hours(r.range_seconds),
      entries: Number(r.entries ?? 0),
    })),
    recentEntries: recentEntries.map((r) => ({
      id: r.id,
      title: r.title,
      scope: r.scope,
      startTime: r.start_time,
      endTime: r.end_time,
      durationSeconds: Number(r.duration_seconds ?? 0),
      projectId: r.project_id,
      projectName: r.project_name,
      taskId: r.task_id,
      taskTitle: r.task_title,
      userName: r.user_name,
    })),
  };
}

export async function getProjectWorkSummaryReport({
  tenantId,
  projectId,
  startDate,
  endDate,
}: {
  tenantId: string;
  projectId: string;
} & WorkSummaryRange) {
  const projectRows = rows<any>(await db.execute(sql`
    SELECT
      p.id,
      p.name,
      p.status,
      p.client_id,
      c.company_name,
      p.budget_minutes,
      (
        SELECT COUNT(DISTINCT t.id) FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
      ) AS total_tasks,
      (
        SELECT COUNT(DISTINCT t.id) FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${OPEN_TASK_SQL}
      ) AS open_tasks,
      (
        SELECT COUNT(DISTINCT t.id) FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${OPEN_TASK_SQL} AND t.due_date < NOW()
      ) AS overdue_tasks,
      (
        SELECT COUNT(DISTINCT t.id) FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${DONE_TASK_SQL}
      ) AS completed_tasks,
      (
        SELECT COALESCE(SUM(COALESCE(t.estimate_minutes, 0)), 0) FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND ${OPEN_TASK_SQL}
      ) AS estimated_minutes_open,
      (
        SELECT COALESCE(SUM(COALESCE(t.estimate_minutes, 0)), 0) FROM tasks t
        WHERE t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
      ) AS estimated_minutes_total,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0) FROM time_entries te
        WHERE te.project_id = p.id AND te.tenant_id = ${tenantId} AND te.start_time BETWEEN ${startDate} AND ${endDate}
      ) AS range_seconds,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0) FROM time_entries te
        WHERE te.project_id = p.id AND te.tenant_id = ${tenantId} AND te.start_time <= ${endDate}
      ) AS lifetime_seconds,
      GREATEST(
        (SELECT MAX(t.updated_at) FROM tasks t WHERE t.project_id = p.id AND t.tenant_id = ${tenantId}),
        (SELECT MAX(te.start_time) FROM time_entries te WHERE te.project_id = p.id AND te.tenant_id = ${tenantId})
      ) AS last_activity_at
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
    WHERE p.tenant_id = ${tenantId} AND p.id = ${projectId}
    LIMIT 1
  `));
  const project = projectRows[0];
  if (!project) return null;

  const projectTasks = rows<any>(await db.execute(sql`
    SELECT
      t.id AS task_id,
      t.title,
      t.status,
      t.priority,
      t.due_date,
      t.estimate_minutes,
      p.id AS project_id,
      p.name AS project_name,
      COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time BETWEEN ${startDate} AND ${endDate}), 0) AS range_seconds,
      COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time <= ${endDate}), 0) AS lifetime_seconds,
      MAX(te.start_time) FILTER (WHERE te.start_time <= ${endDate}) AS last_time_at
    FROM projects p
    JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    LEFT JOIN time_entries te ON te.task_id = t.id AND te.tenant_id = ${tenantId}
    WHERE p.tenant_id = ${tenantId} AND p.id = ${projectId}
    GROUP BY t.id, t.title, t.status, t.priority, t.due_date, t.estimate_minutes, p.id, p.name
    ORDER BY range_seconds DESC, t.due_date ASC NULLS LAST, t.updated_at DESC
  `)).map((r) => ({
    taskId: r.task_id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.due_date,
    projectId: r.project_id,
    projectName: r.project_name,
    estimateHours: estimateHours(r.estimate_minutes),
    rangeHours: hours(r.range_seconds),
    lifetimeHours: hours(r.lifetime_seconds),
    lastTimeAt: r.last_time_at,
  }));
  const projectContributors = rows<any>(await db.execute(sql`
    SELECT
      u.id AS user_id,
      COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.name, u.email) AS name,
      COALESCE(SUM(te.duration_seconds), 0) AS range_seconds,
      COUNT(te.id) AS entries
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.tenant_id = ${tenantId}
      AND te.project_id = ${projectId}
      AND te.start_time BETWEEN ${startDate} AND ${endDate}
    GROUP BY u.id, u.first_name, u.last_name, u.name, u.email
    ORDER BY range_seconds DESC
    LIMIT 25
  `));

  const totalTasks = Number(project.total_tasks ?? 0);
  const completedTasks = Number(project.completed_tasks ?? 0);
  const rangeHours = hours(project.range_seconds);
  const variance = calculateWorkVariance({
    lifetimeSeconds: project.lifetime_seconds,
    estimatedMinutes: project.estimated_minutes_total,
    budgetMinutes: project.budget_minutes,
  });
  const lifetimeHours = variance.lifetimeHours;
  const budgetHours = variance.budgetHours;
  const estimatedOpenHours = estimateHours(project.estimated_minutes_open);
  const estimatedTotalHours = variance.estimatedTotalHours;

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      clientId: project.client_id,
      clientName: project.company_name,
    },
    range: { startDate, endDate },
    visibility: {
      mode: "internal",
      clientSafeAvailable: true,
      hiddenFromClient: ["varianceHours", "riskLanguage"],
    },
    totals: {
      rangeHours,
      lifetimeHours,
      totalTasks,
      openTasks: Number(project.open_tasks ?? 0),
      overdueTasks: Number(project.overdue_tasks ?? 0),
      completedTasks,
      completionPercent: calculateCompletionPercent(completedTasks, totalTasks),
      estimatedOpenHours,
      estimatedTotalHours,
      budgetHours,
      varianceHours: variance.varianceHours,
      budgetVarianceHours: variance.budgetVarianceHours,
      lastActivityAt: project.last_activity_at ?? null,
      inactivityDays: daysSince(project.last_activity_at ?? null),
    },
    tasks: projectTasks,
    contributors: projectContributors.map((r) => ({
      userId: r.user_id,
      name: r.name,
      rangeHours: hours(r.range_seconds),
      entries: Number(r.entries ?? 0),
    })),
  };
}

export async function getPmPortfolioReport({
  tenantId,
  startDate,
  endDate,
}: { tenantId: string } & WorkSummaryRange) {
  const ytdStart = startOfYear(endDate);
  const [projectResult, clientResult, tenantTimeResult] = await Promise.all([
    db.execute(sql`
      WITH assignment_counts AS (
        SELECT ta.task_id, COUNT(*) AS assignee_count
        FROM task_assignees ta
        WHERE ta.tenant_id = ${tenantId}
        GROUP BY ta.task_id
      ), task_rollups AS (
        SELECT
          t.project_id,
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled')) AS open_tasks,
          COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW()) AS overdue_tasks,
          COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_date >= NOW() AND t.due_date < NOW() + INTERVAL '7 days') AS due_soon_tasks,
          COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND COALESCE(ac.assignee_count, 0) = 0) AS unassigned_tasks,
          COUNT(*) FILTER (WHERE t.status = 'done') AS completed_tasks,
          COALESCE(SUM(t.estimate_minutes) FILTER (WHERE t.status NOT IN ('done', 'cancelled')), 0) AS estimated_minutes_open,
          COALESCE(SUM(t.estimate_minutes), 0) AS estimated_minutes_total,
          MAX(t.updated_at) AS last_task_activity_at
        FROM tasks t
        LEFT JOIN assignment_counts ac ON ac.task_id = t.id
        WHERE t.tenant_id = ${tenantId} AND t.archived_at IS NULL
        GROUP BY t.project_id
      ), time_rollups AS (
        SELECT
          te.project_id,
          COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time BETWEEN ${startDate} AND ${endDate}), 0) AS range_seconds,
          COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time BETWEEN ${ytdStart} AND ${endDate}), 0) AS ytd_seconds,
          COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time <= ${endDate}), 0) AS lifetime_seconds,
          MAX(te.start_time) FILTER (WHERE te.start_time <= ${endDate}) AS last_time_activity_at
        FROM time_entries te
        WHERE te.tenant_id = ${tenantId} AND te.project_id IS NOT NULL
        GROUP BY te.project_id
      )
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.status,
        p.client_id,
        c.company_name AS client_name,
        p.budget_minutes,
        COALESCE(tr.total_tasks, 0) AS total_tasks,
        COALESCE(tr.open_tasks, 0) AS open_tasks,
        COALESCE(tr.overdue_tasks, 0) AS overdue_tasks,
        COALESCE(tr.due_soon_tasks, 0) AS due_soon_tasks,
        COALESCE(tr.unassigned_tasks, 0) AS unassigned_tasks,
        COALESCE(tr.completed_tasks, 0) AS completed_tasks,
        COALESCE(tr.estimated_minutes_open, 0) AS estimated_minutes_open,
        COALESCE(tr.estimated_minutes_total, 0) AS estimated_minutes_total,
        COALESCE(tmr.range_seconds, 0) AS range_seconds,
        COALESCE(tmr.ytd_seconds, 0) AS ytd_seconds,
        COALESCE(tmr.lifetime_seconds, 0) AS lifetime_seconds,
        GREATEST(tr.last_task_activity_at, tmr.last_time_activity_at, p.updated_at) AS last_activity_at
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
      LEFT JOIN task_rollups tr ON tr.project_id = p.id
      LEFT JOIN time_rollups tmr ON tmr.project_id = p.id
      WHERE p.tenant_id = ${tenantId} AND p.status != 'archived'
      ORDER BY overdue_tasks DESC, range_seconds DESC, p.name ASC
    `),
    db.execute(sql`
      WITH project_rollups AS (
        SELECT
          p.client_id,
          COUNT(*) FILTER (WHERE p.status = 'active') AS active_projects,
          MAX(p.updated_at) AS last_project_activity_at
        FROM projects p
        WHERE p.tenant_id = ${tenantId}
        GROUP BY p.client_id
      ), task_rollups AS (
        SELECT
          p.client_id,
          COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled')) AS open_tasks,
          COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW()) AS overdue_tasks,
          COUNT(*) FILTER (WHERE t.status = 'done' AND t.updated_at BETWEEN ${startDate} AND ${endDate}) AS completed_in_range,
          MAX(t.updated_at) AS last_task_activity_at
        FROM projects p
        JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
        WHERE p.tenant_id = ${tenantId}
        GROUP BY p.client_id
      ), attributed_time AS (
        SELECT COALESCE(p.client_id, te.client_id) AS client_id, te.start_time, te.duration_seconds, te.scope
        FROM time_entries te
        LEFT JOIN projects p ON p.id = te.project_id AND p.tenant_id = ${tenantId}
        WHERE te.tenant_id = ${tenantId} AND COALESCE(p.client_id, te.client_id) IS NOT NULL
      ), time_rollups AS (
        SELECT
          at.client_id,
          COALESCE(SUM(at.duration_seconds) FILTER (WHERE at.start_time BETWEEN ${startDate} AND ${endDate}), 0) AS range_seconds,
          COALESCE(SUM(at.duration_seconds) FILTER (WHERE at.start_time BETWEEN ${startDate} AND ${endDate} AND at.scope = 'out_of_scope'), 0) AS billable_range_seconds,
          COALESCE(SUM(at.duration_seconds) FILTER (WHERE at.start_time BETWEEN ${ytdStart} AND ${endDate}), 0) AS ytd_seconds,
          COALESCE(SUM(at.duration_seconds) FILTER (WHERE at.start_time <= ${endDate}), 0) AS lifetime_seconds,
          MAX(at.start_time) FILTER (WHERE at.start_time <= ${endDate}) AS last_time_activity_at
        FROM attributed_time at
        GROUP BY at.client_id
      )
      SELECT
        c.id AS client_id,
        c.company_name,
        COALESCE(pr.active_projects, 0) AS active_projects,
        COALESCE(tr.open_tasks, 0) AS open_tasks,
        COALESCE(tr.overdue_tasks, 0) AS overdue_tasks,
        COALESCE(tr.completed_in_range, 0) AS completed_in_range,
        COALESCE(tmr.range_seconds, 0) AS range_seconds,
        COALESCE(tmr.billable_range_seconds, 0) AS billable_range_seconds,
        COALESCE(tmr.ytd_seconds, 0) AS ytd_seconds,
        COALESCE(tmr.lifetime_seconds, 0) AS lifetime_seconds,
        GREATEST(pr.last_project_activity_at, tr.last_task_activity_at, tmr.last_time_activity_at) AS last_activity_at
      FROM clients c
      LEFT JOIN project_rollups pr ON pr.client_id = c.id
      LEFT JOIN task_rollups tr ON tr.client_id = c.id
      LEFT JOIN time_rollups tmr ON tmr.client_id = c.id
      WHERE c.tenant_id = ${tenantId}
      ORDER BY range_seconds DESC, overdue_tasks DESC, c.company_name ASC
    `),
    db.execute(sql`
      SELECT
        COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time BETWEEN ${startDate} AND ${endDate}), 0) AS range_seconds,
        COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time BETWEEN ${ytdStart} AND ${endDate}), 0) AS ytd_seconds,
        COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.start_time <= ${endDate}), 0) AS lifetime_seconds,
        COALESCE(SUM(te.duration_seconds) FILTER (
          WHERE te.start_time BETWEEN ${startDate} AND ${endDate} AND te.project_id IS NULL AND te.client_id IS NULL
        ), 0) AS unallocated_range_seconds
      FROM time_entries te
      WHERE te.tenant_id = ${tenantId}
    `),
  ]);
  const projectRows = rows<any>(projectResult);
  const clientRollups = rows<any>(clientResult);
  const tenantTimeTotals = rows<any>(tenantTimeResult)[0] ?? {};

  const projects = projectRows.map((r) => {
    const totalTasks = Number(r.total_tasks ?? 0);
    const completedTasks = Number(r.completed_tasks ?? 0);
    const rangeHours = hours(r.range_seconds);
    const variance = calculateWorkVariance({
      lifetimeSeconds: r.lifetime_seconds,
      estimatedMinutes: r.estimated_minutes_total,
      budgetMinutes: r.budget_minutes,
    });
    const lifetimeHours = variance.lifetimeHours;
    const budgetHours = variance.budgetHours;
    const estimatedOpenHours = estimateHours(r.estimated_minutes_open);
    const estimatedTotalHours = variance.estimatedTotalHours;
    const inactivityDays = daysSince(r.last_activity_at ?? null);
    const completionPercent = calculateCompletionPercent(completedTasks, totalTasks);
    const riskReasons: string[] = [];
    if (Number(r.overdue_tasks ?? 0) > 0) riskReasons.push("overdue");
    if (inactivityDays !== null && inactivityDays >= 14) riskReasons.push("stale");
    if (budgetHours > 0 && lifetimeHours > budgetHours) riskReasons.push("over_budget");
    if (rangeHours >= 10 && completionPercent < 30) riskReasons.push("high_time_low_progress");

    return {
      projectId: r.project_id,
      projectName: r.project_name,
      status: r.status,
      clientId: r.client_id,
      clientName: r.client_name,
      totalTasks,
      openTasks: Number(r.open_tasks ?? 0),
      overdueTasks: Number(r.overdue_tasks ?? 0),
      dueSoonTasks: Number(r.due_soon_tasks ?? 0),
      unassignedTasks: Number(r.unassigned_tasks ?? 0),
      completedTasks,
      completionPercent,
      rangeHours,
      ytdHours: hours(r.ytd_seconds),
      lifetimeHours,
      estimatedOpenHours,
      estimatedTotalHours,
      budgetHours,
      varianceHours: variance.varianceHours,
      budgetVarianceHours: variance.budgetVarianceHours,
      lastActivityAt: r.last_activity_at ?? null,
      inactivityDays,
      riskReasons,
    };
  });

  const attentionQueue = projects
    .flatMap((project) => {
      const items: Array<Record<string, unknown>> = [];
      if (project.overdueTasks > 0) {
        items.push({ type: "overdue", severity: "high", message: `${project.overdueTasks} overdue task(s)`, project });
      }
      if (project.dueSoonTasks > 0) {
        items.push({ type: "due_soon", severity: "medium", message: `${project.dueSoonTasks} task(s) due in 7 days`, project });
      }
      if (project.unassignedTasks > 0) {
        items.push({ type: "unassigned", severity: "medium", message: `${project.unassignedTasks} open task(s) unassigned`, project });
      }
      if (project.inactivityDays !== null && project.inactivityDays >= 14) {
        items.push({ type: "stale", severity: "medium", message: `No activity in ${project.inactivityDays} days`, project });
      }
      if (project.rangeHours >= 10 && project.completionPercent < 30) {
        items.push({ type: "high_time_low_progress", severity: "medium", message: `${project.rangeHours}h logged with ${project.completionPercent}% completion`, project });
      }
      return items;
    })
    .slice(0, 50);

  const totals = {
    activeProjects: projects.filter((p) => p.status === "active").length,
    projectsAtRisk: projects.filter((p) => p.riskReasons.length > 0).length,
    overdueTasks: projects.reduce((sum, p) => sum + p.overdueTasks, 0),
    dueSoonTasks: projects.reduce((sum, p) => sum + p.dueSoonTasks, 0),
    unassignedTasks: projects.reduce((sum, p) => sum + p.unassignedTasks, 0),
    rangeHours: hours(tenantTimeTotals.range_seconds),
    ytdHours: hours(tenantTimeTotals.ytd_seconds),
    lifetimeHours: hours(tenantTimeTotals.lifetime_seconds),
    unallocatedRangeHours: hours(tenantTimeTotals.unallocated_range_seconds),
  };

  return {
    range: { startDate, endDate },
    visibility: {
      mode: "internal",
      clientSafeAvailable: false,
      hiddenFromClient: ["attentionQueue", "riskReasons", "varianceHours"],
    },
    totals,
    attentionQueue,
    projects,
    resultSet: {
      projectCount: projects.length,
      clientCount: clientRollups.length,
      truncated: false,
    },
    clients: clientRollups.map((r) => ({
      clientId: r.client_id,
      companyName: r.company_name,
      activeProjects: Number(r.active_projects ?? 0),
      openTasks: Number(r.open_tasks ?? 0),
      overdueTasks: Number(r.overdue_tasks ?? 0),
      completedInRange: Number(r.completed_in_range ?? 0),
      rangeHours: hours(r.range_seconds),
      billableHours: hours(r.billable_range_seconds),
      ytdHours: hours(r.ytd_seconds),
      lifetimeHours: hours(r.lifetime_seconds),
      lastActivityAt: r.last_activity_at ?? null,
      inactivityDays: daysSince(r.last_activity_at ?? null),
    })),
  };
}
