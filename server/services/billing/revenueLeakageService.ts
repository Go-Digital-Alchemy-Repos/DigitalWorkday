/**
 * Revenue Leakage Detection Service
 *
 * Identifies billable work that is not being invoiced across 4 detection rules:
 * 1. Approved time entries not yet invoiced (unbilled approved hours)
 * 2. Non-billable (out_of_scope) time entries that may be misclassified
 * 3. Open tasks with zero time logged (billable tasks missing time)
 * 4. In-scope time entries where the user has no billable rate set (over-service risk)
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export interface UnbilledClientEntry {
  clientId: string;
  clientName: string;
  totalHours: number;
  estimatedRevenue: number;
  entryCount: number;
  oldestApprovedDate: string | null;
}

export interface MisclassifiedClientEntry {
  clientId: string;
  clientName: string;
  outOfScopeHours: number;
  totalHours: number;
  nonBillablePct: number;
  entryCount: number;
}

export interface TaskMissingTime {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  status: string;
  dueDate: string | null;
}

export interface OverServicedClient {
  clientId: string;
  clientName: string;
  inScopeHoursWithNoRate: number;
  entryCount: number;
  estimatedRevenueLost: number;
}

export interface RevenueLeakageResult {
  unbilledApprovedHours: {
    totalHours: number;
    totalEstimatedRevenue: number;
    byClient: UnbilledClientEntry[];
  };
  misclassifiedTimeEntries: {
    totalOutOfScopeHours: number;
    byClient: MisclassifiedClientEntry[];
  };
  billableTasksMissingTime: {
    count: number;
    tasks: TaskMissingTime[];
  };
  clientOverServiceRisk: {
    count: number;
    totalUnbillableHours: number;
    byClient: OverServicedClient[];
  };
  computedAt: string;
}

const NON_BILLABLE_THRESHOLD_PCT = 40;
const MISSING_TIME_TASK_LIMIT = 20;

export async function detectRevenueLeakage(
  tenantId: string,
  dateRange: DateRange = {}
): Promise<RevenueLeakageResult> {

  const startDate = dateRange.startDate
    ? dateRange.startDate
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ─────────────────────────────────────────────────────────────────────────
  // Rule 1: Approved time entries not yet invoiced
  // ─────────────────────────────────────────────────────────────────────────
  const rule1Rows = await db.execute(sql`
    SELECT
      COALESCE(te.client_id, '__unknown__')            AS client_id,
      COALESCE(c.company_name, 'Unknown Client')       AS client_name,
      SUM(te.duration_seconds)                         AS total_seconds,
      SUM(
        te.duration_seconds::float / 3600.0
        * COALESCE(u.billable_rate::float, 0)
      )                                                AS revenue,
      COUNT(*)                                         AS entry_count,
      MIN(te.start_time)                               AS oldest_date
    FROM time_entries te
    LEFT JOIN clients c ON te.client_id = c.id
    LEFT JOIN users u   ON te.user_id   = u.id
    WHERE te.tenant_id      = ${tenantId}
      AND te.billing_status = 'approved'
      AND te.start_time     >= ${startDate}::date
    GROUP BY te.client_id, c.company_name
    ORDER BY revenue DESC
  `);

  const unbilledByClientList: UnbilledClientEntry[] = (rule1Rows.rows as any[]).map((row) => ({
    clientId: row.client_id,
    clientName: row.client_name,
    totalHours: Math.round((Number(row.total_seconds) / 3600) * 100) / 100,
    estimatedRevenue: Math.round(Number(row.revenue) * 100) / 100,
    entryCount: Number(row.entry_count),
    oldestApprovedDate: row.oldest_date ? new Date(row.oldest_date).toISOString() : null,
  }));

  const totalUnbilledHours = unbilledByClientList.reduce((s, c) => s + c.totalHours, 0);
  const totalEstimatedRevenue = unbilledByClientList.reduce((s, c) => s + c.estimatedRevenue, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Rule 2: Out-of-scope (non-billable) time entries — possible misclassification
  // ─────────────────────────────────────────────────────────────────────────
  const rule2Rows = await db.execute(sql`
    SELECT
      COALESCE(te.client_id, '__unknown__')                     AS client_id,
      COALESCE(c.company_name, 'Unknown Client')                AS client_name,
      SUM(te.duration_seconds)                                  AS total_seconds,
      SUM(CASE WHEN te.scope = 'out_of_scope'
               THEN te.duration_seconds ELSE 0 END)             AS oos_seconds,
      COUNT(CASE WHEN te.scope = 'out_of_scope' THEN 1 END)    AS oos_count
    FROM time_entries te
    LEFT JOIN clients c ON te.client_id = c.id
    WHERE te.tenant_id  = ${tenantId}
      AND te.start_time >= ${startDate}::date
    GROUP BY te.client_id, c.company_name
    HAVING
      SUM(te.duration_seconds) > 0
      AND (
        SUM(CASE WHEN te.scope = 'out_of_scope'
                 THEN te.duration_seconds ELSE 0 END)::float
        / SUM(te.duration_seconds)::float * 100
      ) >= ${NON_BILLABLE_THRESHOLD_PCT}
    ORDER BY oos_seconds DESC
  `);

  const misclassifiedList: MisclassifiedClientEntry[] = (rule2Rows.rows as any[]).map((row) => {
    const totalSec = Number(row.total_seconds);
    const oosSec = Number(row.oos_seconds);
    return {
      clientId: row.client_id,
      clientName: row.client_name,
      outOfScopeHours: Math.round((oosSec / 3600) * 100) / 100,
      totalHours: Math.round((totalSec / 3600) * 100) / 100,
      nonBillablePct: totalSec > 0 ? Math.round((oosSec / totalSec) * 10000) / 100 : 0,
      entryCount: Number(row.oos_count),
    };
  });

  const totalOutOfScopeHours = misclassifiedList.reduce((s, c) => s + c.outOfScopeHours, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Rule 3: Open tasks with zero time logged
  // ─────────────────────────────────────────────────────────────────────────
  const rule3Rows = await db.execute(sql`
    SELECT
      t.id                                        AS task_id,
      t.title                                     AS task_title,
      COALESCE(t.project_id, '')                  AS project_id,
      COALESCE(p.name, 'Unknown Project')         AS project_name,
      t.status                                    AS status,
      t.due_date                                  AS due_date
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.tenant_id  = ${tenantId}
      AND t.archived_at IS NULL
      AND t.status NOT IN ('done', 'completed', 'cancelled', 'canceled')
      AND t.id NOT IN (
        SELECT DISTINCT task_id
        FROM time_entries
        WHERE tenant_id = ${tenantId}
          AND task_id IS NOT NULL
      )
    LIMIT ${MISSING_TIME_TASK_LIMIT}
  `);

  const tasksMissingTime: TaskMissingTime[] = (rule3Rows.rows as any[]).map((row) => ({
    taskId: row.task_id,
    taskTitle: row.task_title,
    projectId: row.project_id,
    projectName: row.project_name,
    status: row.status,
    dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Rule 4: In-scope time where user has no billable rate (over-service risk)
  // ─────────────────────────────────────────────────────────────────────────
  const rule4Rows = await db.execute(sql`
    SELECT
      COALESCE(te.client_id, '__unknown__')      AS client_id,
      COALESCE(c.company_name, 'Unknown Client') AS client_name,
      SUM(te.duration_seconds)                   AS no_rate_seconds,
      COUNT(*)                                   AS entry_count
    FROM time_entries te
    LEFT JOIN clients c ON te.client_id = c.id
    LEFT JOIN users u   ON te.user_id   = u.id
    WHERE te.tenant_id      = ${tenantId}
      AND te.scope           = 'in_scope'
      AND te.billing_status != 'invoiced'
      AND te.start_time     >= ${startDate}::date
      AND (u.billable_rate IS NULL OR u.billable_rate::float = 0)
    GROUP BY te.client_id, c.company_name
    ORDER BY no_rate_seconds DESC
  `);

  const overServicedList: OverServicedClient[] = (rule4Rows.rows as any[]).map((row) => ({
    clientId: row.client_id,
    clientName: row.client_name,
    inScopeHoursWithNoRate: Math.round((Number(row.no_rate_seconds) / 3600) * 100) / 100,
    entryCount: Number(row.entry_count),
    estimatedRevenueLost: 0,
  }));

  const totalOverServiceHours = overServicedList.reduce(
    (s, c) => s + c.inScopeHoursWithNoRate,
    0
  );

  return {
    unbilledApprovedHours: {
      totalHours: Math.round(totalUnbilledHours * 100) / 100,
      totalEstimatedRevenue: Math.round(totalEstimatedRevenue * 100) / 100,
      byClient: unbilledByClientList,
    },
    misclassifiedTimeEntries: {
      totalOutOfScopeHours: Math.round(totalOutOfScopeHours * 100) / 100,
      byClient: misclassifiedList,
    },
    billableTasksMissingTime: {
      count: tasksMissingTime.length,
      tasks: tasksMissingTime,
    },
    clientOverServiceRisk: {
      count: overServicedList.length,
      totalUnbillableHours: Math.round(totalOverServiceHours * 100) / 100,
      byClient: overServicedList,
    },
    computedAt: new Date().toISOString(),
  };
}
