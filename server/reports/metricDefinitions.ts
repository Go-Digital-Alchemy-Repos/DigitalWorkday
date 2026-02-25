/**
 * REPORTING METRIC GOVERNANCE SYSTEM
 *
 * Centralized definitions for all reporting metrics used across:
 *  - Employee Command Center  (/api/reports/v2/employee/*)
 *  - Client Command Center    (/api/reports/v2/client/*)
 *  - Workload Reports V2      (/api/reports/v2/workload/*)
 *
 * Rules enforced here:
 *  - Derived metrics never divide by zero   → return null
 *  - Utilization cap at 200% before flagging
 *  - estimatedHours = null → excluded from efficiency
 *  - No data → return 0 (not null), except ratio/derived metrics
 *
 * @module server/reports/metricDefinitions
 */

export type MetricType = "range_based" | "current_state" | "derived";

export interface MetricDefinition {
  description: string;
  calculation: string;
  type: MetricType;
  dateField?: string;
  nullHandling?: string;
}

export const MetricDefinitions: Record<string, MetricDefinition> = {

  // ── TASK METRICS ────────────────────────────────────────────────────────────

  assignedCount: {
    description: "Number of tasks assigned to a user within the selected date range",
    calculation: "COUNT(tasks WHERE assignee_id = userId AND created_at BETWEEN startDate AND endDate)",
    type: "range_based",
    dateField: "tasks.created_at",
    nullHandling: "Returns 0 if no matching tasks",
  },

  completedCount: {
    description: "Tasks marked done within the selected date range",
    calculation: "COUNT(tasks WHERE status = 'done' AND updated_at BETWEEN startDate AND endDate)",
    type: "range_based",
    dateField: "tasks.updated_at",
    nullHandling: "Returns 0 if no completed tasks. NOTE: database uses updated_at+status='done' as a proxy for completion timestamp since no dedicated completed_at column exists.",
  },

  activeTasks: {
    description: "Tasks currently open (not done or cancelled), irrespective of date range",
    calculation: "COUNT(tasks WHERE status NOT IN ('done', 'cancelled'))",
    type: "current_state",
    nullHandling: "Returns 0 if none",
  },

  overdueTasks: {
    description: "Open tasks whose due_date has passed",
    calculation: "COUNT(tasks WHERE status NOT IN ('done','cancelled') AND due_date < NOW())",
    type: "current_state",
    nullHandling: "Returns 0 if none. Tasks with NULL due_date are excluded.",
  },

  dueSoonCount: {
    description: "Open tasks with due_date within the next 7 days",
    calculation: "COUNT(tasks WHERE status NOT IN ('done','cancelled') AND due_date BETWEEN NOW() AND NOW()+7days)",
    type: "current_state",
    nullHandling: "Returns 0 if none",
  },

  backlogCount: {
    description: "Open tasks that have not been updated in more than 14 days",
    calculation: "COUNT(tasks WHERE status NOT IN ('done','cancelled') AND updated_at < NOW() - INTERVAL '14 days')",
    type: "current_state",
    nullHandling: "Returns 0 if none",
  },

  avgCompletionDays: {
    description: "Average calendar days from task creation to completion, for tasks completed in range",
    calculation: "AVG(EXTRACT(days FROM (updated_at - created_at))) WHERE status='done' AND updated_at BETWEEN startDate AND endDate",
    type: "range_based",
    dateField: "tasks.updated_at",
    nullHandling: "Returns null if no completed tasks in range",
  },

  // ── TIME ENTRY METRICS ───────────────────────────────────────────────────────

  totalHours: {
    description: "Sum of all time entry hours within the date range",
    calculation: "SUM(time_entries.duration_seconds / 3600) WHERE start_time BETWEEN startDate AND endDate",
    type: "range_based",
    dateField: "time_entries.start_time",
    nullHandling: "Returns 0 if no entries. COALESCE(SUM(...), 0) always used.",
  },

  billableHours: {
    description: "Sum of billable time entry hours within the date range",
    calculation: "SUM(time_entries.duration_seconds / 3600) WHERE start_time BETWEEN startDate AND endDate AND is_billable = true",
    type: "range_based",
    dateField: "time_entries.start_time",
    nullHandling: "Returns 0 if no billable entries or if is_billable column is unavailable",
  },

  nonBillableHours: {
    description: "Total hours minus billable hours",
    calculation: "totalHours - billableHours",
    type: "derived",
    nullHandling: "Returns 0 if totalHours = 0",
  },

  estimatedHours: {
    description: "Sum of estimate_minutes / 60 for active tasks assigned to user",
    calculation: "SUM(COALESCE(tasks.estimate_minutes, 0)) / 60 WHERE status NOT IN ('done','cancelled')",
    type: "current_state",
    nullHandling: "NULL estimate_minutes treated as 0. Returns 0 if no active tasks.",
  },

  loggedDays: {
    description: "Number of distinct calendar days with time entries in range",
    calculation: "COUNT(DISTINCT DATE(time_entries.start_time)) WHERE start_time BETWEEN startDate AND endDate",
    type: "range_based",
    dateField: "time_entries.start_time",
    nullHandling: "Returns 0 if no entries",
  },

  // ── DERIVED / RATIO METRICS ──────────────────────────────────────────────────

  utilizationPct: {
    description: "Actual hours tracked as a percentage of available hours (8h/day × days in range)",
    calculation: "ROUND((totalHours / (daysInRange × 8)) × 100)",
    type: "derived",
    nullHandling: "If availableHours = 0, returns null (not 0). If totalHours = 0, returns 0.",
  },

  efficiencyRatio: {
    description: "Ratio of actual hours worked to estimated task hours",
    calculation: "ROUND((totalHours / estimatedHours) × 100) / 100",
    type: "derived",
    nullHandling: "If estimatedHours = 0 or null, returns null — excluded from efficiency calculation entirely.",
  },

  avgHoursPerDay: {
    description: "Average hours tracked per day with at least one entry",
    calculation: "totalHours / loggedDays",
    type: "derived",
    nullHandling: "If loggedDays = 0, returns 0",
  },

  varianceHours: {
    description: "Difference between actual hours and estimated hours (positive = over estimate)",
    calculation: "totalHours - estimatedHours",
    type: "derived",
    nullHandling: "Returns 0 if estimatedHours is 0",
  },

  completionRate: {
    description: "Ratio of completed tasks to all tasks (completed + active) for user",
    calculation: "completedInRange / (completedInRange + activeTasks)",
    type: "derived",
    nullHandling: "If denominator = 0, returns null",
  },

  // ── CLIENT METRICS ────────────────────────────────────────────────────────────

  engagementScore: {
    description: "Composite 0–100 score measuring client engagement based on hours, open tasks, and completed tasks",
    calculation: "MIN(100, ROUND(LEAST(totalHours,40)/40×40 + LEAST(openTasks,20)/20×40 + LEAST(completedInRange,10)/10×20))",
    type: "derived",
    nullHandling: "Returns 0 if all inputs are 0",
  },

  overdueTaskPct: {
    description: "Percentage of all client tasks that are overdue",
    calculation: "overdueTasks / totalTasks × 100",
    type: "derived",
    nullHandling: "If totalTasks = 0, returns null",
  },

  completedWithinDuePct: {
    description: "Percentage of completed tasks (with a due date) that were completed on or before due date",
    calculation: "completedOnTime / totalDoneWithDue × 100",
    type: "derived",
    nullHandling: "If totalDoneWithDue = 0, returns null",
  },

  inactivityDays: {
    description: "Calendar days since any task update, time entry, or comment for a client",
    calculation: "EXTRACT(days FROM NOW() - GREATEST(MAX(tasks.updated_at), MAX(time_entries.start_time), MAX(comments.created_at)))",
    type: "current_state",
    nullHandling: "Returns null if no activity exists at all for this client",
  },

  // ── CAPACITY / RISK METRICS ──────────────────────────────────────────────────

  plannedHoursWeekly: {
    description: "Sum of estimate_minutes / 60 for active tasks due within a given calendar week",
    calculation: "SUM(tasks.estimate_minutes / 60) WHERE due_date BETWEEN weekStart AND weekEnd AND status NOT IN ('done','cancelled')",
    type: "range_based",
    dateField: "tasks.due_date",
    nullHandling: "NULL estimate_minutes excluded. Returns 0 if no tasks.",
  },

  actualHoursWeekly: {
    description: "Sum of time entry hours logged within a given calendar week",
    calculation: "SUM(time_entries.duration_seconds / 3600) WHERE start_time BETWEEN weekStart AND weekEnd",
    type: "range_based",
    dateField: "time_entries.start_time",
    nullHandling: "Returns 0 if no entries",
  },

  weeklyUtilizationPct: {
    description: "Actual weekly hours as a percentage of standard 40-hour work week",
    calculation: "actualHoursWeekly / 40 × 100",
    type: "derived",
    nullHandling: "Always uses 40h denominator — never null. Returns 0 if no time logged.",
  },
};

// ── NULL / EDGE-CASE ENFORCEMENT RULES (Phase 3) ────────────────────────────

export const MetricNullRules = {
  estimatedHoursZero: "If estimatedHours = 0 or null → exclude from efficiency calculation (efficiencyRatio = null)",
  availableHoursZero: "If availableHours = 0 → utilizationPct = null, not 0",
  noData: "All COUNT/SUM metrics return 0 (not null) when no matching rows exist",
  ratiosWithZeroDenominator: "All ratio/percentage metrics return null when denominator = 0",
  utilizationCap: "Utilization > 200% triggers overutilization risk flag — not capped in display",
  negativeValues: "Negative values in counts or hours flagged in dev mode validateMetricConsistency()",
} as const;

// ── VALIDATION HELPER (Phase 4) ───────────────────────────────────────────────

export interface MetricValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates a computed metric dataset for common consistency issues.
 * Only logs warnings in development — does NOT throw in production.
 *
 * @param metricKey  Key from MetricDefinitions
 * @param dataset    Array of objects to validate (each object may contain the metric value)
 */
export function validateMetricConsistency(
  metricKey: string,
  dataset: Record<string, unknown>[]
): MetricValidationResult {
  const result: MetricValidationResult = { valid: true, warnings: [], errors: [] };
  const isDev = process.env.NODE_ENV === "development";

  for (const row of dataset) {
    const value = row[metricKey];

    if (typeof value === "number") {
      if (value < 0) {
        result.valid = false;
        result.errors.push(`[${metricKey}] Negative value detected: ${value}`);
      }

      if (metricKey === "utilizationPct" && value > 200) {
        result.warnings.push(`[${metricKey}] Utilization > 200% flagged: ${value}%`);
      }

      if (
        (metricKey === "efficiencyRatio" || metricKey === "utilizationPct" || metricKey === "completionRate") &&
        isNaN(value)
      ) {
        result.valid = false;
        result.errors.push(`[${metricKey}] NaN detected — likely division by zero`);
      }
    }
  }

  if (isDev && (result.warnings.length > 0 || result.errors.length > 0)) {
    console.warn(`[MetricGovernance] validateMetricConsistency(${metricKey}):`, {
      warnings: result.warnings,
      errors: result.errors,
    });
  }

  return result;
}

/**
 * Safe division helper — returns null instead of Infinity/NaN.
 * Use for all derived ratio/percentage computations.
 */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!denominator || denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Safe utilization — returns null when no available hours.
 */
export function computeUtilizationPct(totalHours: number, daysInRange: number): number | null {
  const available = daysInRange * 8;
  if (available <= 0) return null;
  return Math.round((totalHours / available) * 100);
}

/**
 * Safe efficiency ratio — returns null when estimatedHours is zero/null.
 */
export function computeEfficiencyRatio(totalHours: number, estimatedHours: number | null): number | null {
  if (!estimatedHours || estimatedHours <= 0) return null;
  return Math.round((totalHours / estimatedHours) * 100) / 100;
}

/**
 * Safe completion rate — returns null when no tasks exist.
 */
export function computeCompletionRate(completed: number, active: number): number | null {
  const denom = completed + active;
  if (denom <= 0) return null;
  return Math.round((completed / denom) * 100);
}
