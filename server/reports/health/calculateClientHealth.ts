/**
 * CLIENT HEALTH INDEX (CHI) — CALCULATION ENGINE
 *
 * Computes the composite CHI score for one or all clients in a tenant.
 * Uses the same DB query patterns as the Client CC endpoints (tenant-scoped).
 *
 * @module server/reports/health/calculateClientHealth
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import {
  normalizeOverdueRate,
  normalizeEngagement,
  normalizeTimeOverrun,
  normalizeSlaCompliance,
  normalizeActivity,
  computeOverallHealthScore,
  getHealthTier,
  type HealthComponentScores,
  type HealthTier,
} from "./clientHealthModel";

export interface ClientHealthResult {
  clientId: string;
  companyName: string;
  overallScore: number;
  healthTier: HealthTier;
  componentScores: HealthComponentScores;
  riskFlags: string[];
  rawMetrics: {
    totalTasks: number;
    overdueCount: number;
    completedOnTime: number;
    totalDoneWithDue: number;
    totalHoursInRange: number;
    estimatedHours: number;
    commentCount: number;
    daysSinceLastActivity: number | null;
    activeProjects: number;
  };
}

export interface CalculateHealthOptions {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  clientId?: string | null;
  limit?: number;
  offset?: number;
}

export async function calculateClientHealth(
  opts: CalculateHealthOptions
): Promise<{ results: ClientHealthResult[]; total: number }> {
  const { tenantId, startDate, endDate, clientId, limit = 50, offset = 0 } = opts;

  const clientFilter = clientId
    ? sql`AND c.id = ${clientId}`
    : sql``;

  const rows = await db.execute<{
    client_id: string;
    company_name: string;
    total_tasks: string;
    overdue_count: string;
    completed_on_time: string;
    total_done_with_due: string;
    total_seconds: string;
    estimated_minutes: string;
    comment_count: string;
    days_since_last_activity: string | null;
    active_projects: string;
    total_count: string;
  }>(sql`
    SELECT
      c.id AS client_id,
      c.company_name,
      COUNT(DISTINCT t.id) AS total_tasks,
      COUNT(DISTINCT CASE
        WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id
      END) AS overdue_count,
      COUNT(DISTINCT CASE
        WHEN t.status = 'done'
          AND t.due_date IS NOT NULL
          AND t.updated_at <= t.due_date
        THEN t.id
      END) AS completed_on_time,
      COUNT(DISTINCT CASE
        WHEN t.status = 'done' AND t.due_date IS NOT NULL THEN t.id
      END) AS total_done_with_due,
      COALESCE(SUM(
        CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate}
        THEN te.duration_seconds ELSE 0 END
      ), 0) AS total_seconds,
      COALESCE(SUM(
        CASE WHEN t.status NOT IN ('done','cancelled')
        THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END
      ), 0) AS estimated_minutes,
      COUNT(DISTINCT CASE
        WHEN cm.created_at >= ${startDate} AND cm.created_at <= ${endDate}
        THEN cm.id END
      ) AS comment_count,
      EXTRACT(EPOCH FROM (NOW() - GREATEST(
        MAX(t.updated_at),
        MAX(te.start_time)
      ))) / 86400.0 AS days_since_last_activity,
      COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS active_projects,
      COUNT(*) OVER() AS total_count
    FROM clients c
    LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
    LEFT JOIN time_entries te ON te.task_id = t.id AND te.tenant_id = ${tenantId}
    LEFT JOIN comments cm ON cm.task_id = t.id
    WHERE c.tenant_id = ${tenantId}
      ${clientFilter}
    GROUP BY c.id, c.company_name
    ORDER BY c.company_name ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rawRows: any = rows;
  const dataRows: any[] = Array.isArray(rawRows) ? rawRows : (rawRows?.rows ?? []);
  const total = dataRows.length > 0 ? Number(dataRows[0].total_count) : 0;

  const results: ClientHealthResult[] = dataRows.map((row: any) => {
    const totalTasks = Number(row.total_tasks);
    const overdueCount = Number(row.overdue_count);
    const completedOnTime = Number(row.completed_on_time);
    const totalDoneWithDue = Number(row.total_done_with_due);
    const totalSeconds = Number(row.total_seconds);
    const estimatedMinutes = Number(row.estimated_minutes);
    const commentCount = Number(row.comment_count);
    const activeProjects = Number(row.active_projects);

    const totalHoursInRange = Math.round((totalSeconds / 3600) * 10) / 10;
    const estimatedHours = Math.round((estimatedMinutes / 60) * 10) / 10;

    const daysSinceLastActivity = row.days_since_last_activity !== null
      ? Math.round(Number(row.days_since_last_activity))
      : null;

    const componentScores: HealthComponentScores = {
      overdue:      normalizeOverdueRate(overdueCount, totalTasks),
      engagement:   normalizeEngagement(totalHoursInRange, commentCount),
      timeOverrun:  normalizeTimeOverrun(totalHoursInRange, estimatedHours),
      slaCompliance: normalizeSlaCompliance(completedOnTime, totalDoneWithDue),
      activity:     normalizeActivity(daysSinceLastActivity),
    };

    const overallScore = computeOverallHealthScore(componentScores);
    const healthTier = getHealthTier(overallScore);

    const riskFlags: string[] = [];
    if (totalTasks > 0 && overdueCount / totalTasks > 0.3) {
      riskFlags.push("High overdue task rate (>30%)");
    }
    if (daysSinceLastActivity !== null && daysSinceLastActivity > 21) {
      riskFlags.push(`No activity in ${daysSinceLastActivity} days`);
    }
    if (estimatedHours > 0 && totalHoursInRange > estimatedHours * 1.5) {
      riskFlags.push("Time significantly over estimate (>150%)");
    }
    if (activeProjects > 0 && totalHoursInRange < 1 && (daysSinceLastActivity ?? 0) > 14) {
      riskFlags.push("Active projects with no time logged recently");
    }
    if (totalDoneWithDue > 0 && completedOnTime / totalDoneWithDue < 0.5) {
      riskFlags.push("Less than 50% of tasks completed on time");
    }

    return {
      clientId: row.client_id,
      companyName: row.company_name,
      overallScore,
      healthTier,
      componentScores,
      riskFlags,
      rawMetrics: {
        totalTasks,
        overdueCount,
        completedOnTime,
        totalDoneWithDue,
        totalHoursInRange,
        estimatedHours,
        commentCount,
        daysSinceLastActivity,
        activeProjects,
      },
    };
  });

  return { results, total };
}
