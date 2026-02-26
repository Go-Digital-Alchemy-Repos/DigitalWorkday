/**
 * EMPLOYEE PERFORMANCE INDEX (EPI) — CALCULATION ENGINE
 *
 * Computes the composite EPI score for one or all employees in a tenant.
 * Uses the existing reporting DB query patterns (tenant-scoped, same field
 * conventions as the metric governance layer).
 *
 * NOT a raw DB duplication: pulls metric primitives using the same SQL patterns
 * defined in the Employee CC endpoints, then delegates scoring to the model.
 *
 * @module server/reports/performance/calculateEmployeePerformance
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import {
  normalizeCompletionRate,
  normalizeOverdueRate,
  normalizeUtilization,
  normalizeEfficiency,
  normalizeTimeCompliance,
  computeOverallScore,
  getPerformanceTier,
  type ComponentScores,
  type PerformanceTier,
} from "./employeePerformanceModel";
import { validateMetricConsistency } from "../../reports/metricDefinitions";

export interface EmployeePerformanceResult {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  overallScore: number;
  componentScores: ComponentScores;
  performanceTier: PerformanceTier;
  riskFlags: string[];
  rawMetrics: {
    activeTasks: number;
    overdueCount: number;
    completedInRange: number;
    totalHours: number;
    estimatedHours: number;
    loggedDays: number;
    daysInRange: number;
    utilizationPct: number | null;
    efficiencyRatio: number | null;
    completionRate: number | null;
    overdueRate: number | null;
    timeCompliancePct: number;
  };
}

export interface CalculateOptions {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  userId?: string | null;
  limit?: number;
  offset?: number;
}

export async function calculateEmployeePerformance(
  opts: CalculateOptions
): Promise<{ results: EmployeePerformanceResult[]; total: number }> {
  const { tenantId, startDate, endDate, userId, limit = 50, offset = 0 } = opts;

  const daysInRange = Math.max(
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    1
  );

  const userFilter = userId
    ? sql`AND u.id = ${userId}`
    : sql``;

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
    estimated_minutes: string;
    logged_days: string;
    total_count: string;
  }>(sql`
    SELECT
      u.id AS user_id,
      u.first_name,
      u.last_name,
      u.email,
      u.avatar_url,
      COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) AS active_tasks,
      COUNT(DISTINCT CASE
        WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id
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
        CASE WHEN t.status NOT IN ('done','cancelled')
        THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END
      ), 0) AS estimated_minutes,
      COUNT(DISTINCT
        CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
        THEN DATE(te.start_time) END
      ) AS logged_days,
      COUNT(*) OVER() AS total_count
    FROM users u
    LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
    LEFT JOIN time_entries te ON te.user_id = u.id AND te.tenant_id = ${tenantId}
    WHERE u.tenant_id = ${tenantId}
      AND u.role IN ('admin', 'employee')
      AND u.is_active = true
      ${userFilter}
    GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
    ORDER BY u.first_name ASC, u.last_name ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const normalizedRows = Array.isArray(rows)
    ? rows
    : (rows && typeof rows === "object" && "rows" in rows)
      ? (rows as { rows: typeof rows }).rows
      : rows;
  const rowsArr = normalizedRows as any[];

  const total = rowsArr.length > 0 ? Number(rowsArr[0].total_count) : 0;

  const results: EmployeePerformanceResult[] = rowsArr.map((row) => {
    const activeTasks = Number(row.active_tasks);
    const overdueCount = Number(row.overdue_tasks);
    const completedInRange = Number(row.completed_in_range);
    const totalSeconds = Number(row.total_seconds);
    const estimatedMinutes = Number(row.estimated_minutes);
    const loggedDays = Number(row.logged_days);

    const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
    const estimatedHours = Math.round((estimatedMinutes / 60) * 10) / 10;
    const availableHours = daysInRange * 8;

    const utilizationPct = availableHours > 0
      ? Math.round((totalHours / availableHours) * 100)
      : null;

    const efficiencyRatio = estimatedHours > 0
      ? Math.round((totalHours / estimatedHours) * 100) / 100
      : null;

    const completionDenom = completedInRange + activeTasks;
    const completionRate = completionDenom > 0
      ? Math.round((completedInRange / completionDenom) * 100)
      : null;

    const overdueRate = activeTasks > 0
      ? overdueCount / activeTasks
      : null;

    const timeCompliancePct = Math.round((loggedDays / daysInRange) * 100);

    const componentScores: ComponentScores = {
      completion:  normalizeCompletionRate(completionRate),
      overdue:     normalizeOverdueRate(overdueRate),
      utilization: normalizeUtilization(utilizationPct),
      efficiency:  normalizeEfficiency(efficiencyRatio),
      compliance:  normalizeTimeCompliance(loggedDays, daysInRange),
    };

    const overallScore = computeOverallScore(componentScores);
    const performanceTier = getPerformanceTier(overallScore);

    const riskFlags: string[] = [];
    if (overdueRate !== null && overdueRate > 0.3 && overdueCount >= 2) {
      riskFlags.push("High overdue rate (>30% of active tasks)");
    }
    if (utilizationPct !== null && utilizationPct > 120) {
      riskFlags.push("Overutilized (>120% of 8h/day capacity)");
    }
    if (timeCompliancePct < 30 && totalHours < 1) {
      riskFlags.push("Low time compliance — few days logged");
    }
    if (efficiencyRatio !== null && efficiencyRatio > 1.5) {
      riskFlags.push("Significantly over time estimates");
    }
    if (completionRate !== null && completionRate < 20 && activeTasks >= 3) {
      riskFlags.push("Low task completion rate");
    }

    validateMetricConsistency("utilizationPct", [{ utilizationPct }]);
    validateMetricConsistency("efficiencyRatio", [{ efficiencyRatio }]);

    return {
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      overallScore,
      componentScores,
      performanceTier,
      riskFlags,
      rawMetrics: {
        activeTasks,
        overdueCount,
        completedInRange,
        totalHours,
        estimatedHours,
        loggedDays,
        daysInRange,
        utilizationPct,
        efficiencyRatio,
        completionRate,
        overdueRate,
        timeCompliancePct,
      },
    };
  });

  return { results, total };
}
