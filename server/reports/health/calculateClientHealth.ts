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
      (
        SELECT COUNT(DISTINCT t.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND t.tenant_id = ${tenantId}
      ) AS total_tasks,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND t.tenant_id = ${tenantId}
          AND t.status NOT IN ('done','cancelled')
          AND t.due_date < NOW()
      ) AS overdue_count,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND t.tenant_id = ${tenantId}
          AND t.status = 'done'
          AND t.due_date IS NOT NULL
          AND t.updated_at <= t.due_date
      ) AS completed_on_time,
      (
        SELECT COUNT(DISTINCT t.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND t.tenant_id = ${tenantId}
          AND t.status = 'done'
          AND t.due_date IS NOT NULL
      ) AS total_done_with_due,
      (
        SELECT COALESCE(SUM(te.duration_seconds), 0)
        FROM projects p
        JOIN time_entries te ON te.project_id = p.id
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND te.tenant_id = ${tenantId}
          AND te.start_time BETWEEN ${startDate} AND ${endDate}
      ) AS total_seconds,
      (
        SELECT COALESCE(SUM(COALESCE(t.estimate_minutes, 0)), 0)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND t.tenant_id = ${tenantId}
          AND t.status NOT IN ('done','cancelled')
      ) AS estimated_minutes,
      (
        SELECT COUNT(DISTINCT cm.id)
        FROM projects p
        JOIN tasks t ON t.project_id = p.id
        JOIN comments cm ON cm.task_id = t.id
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND t.tenant_id = ${tenantId}
          AND cm.created_at BETWEEN ${startDate} AND ${endDate}
      ) AS comment_count,
      EXTRACT(EPOCH FROM (
        NOW() - GREATEST(
          (
            SELECT MAX(t.updated_at)
            FROM projects p
            JOIN tasks t ON t.project_id = p.id
            WHERE p.client_id = c.id
              AND p.tenant_id = ${tenantId}
              AND t.tenant_id = ${tenantId}
          ),
          (
            SELECT MAX(te.start_time)
            FROM projects p
            JOIN time_entries te ON te.project_id = p.id
            WHERE p.client_id = c.id
              AND p.tenant_id = ${tenantId}
              AND te.tenant_id = ${tenantId}
          ),
          (
            SELECT MAX(cm.created_at)
            FROM projects p
            JOIN tasks t ON t.project_id = p.id
            JOIN comments cm ON cm.task_id = t.id
            WHERE p.client_id = c.id
              AND p.tenant_id = ${tenantId}
              AND t.tenant_id = ${tenantId}
          )
        )
      )) / 86400.0 AS days_since_last_activity,
      (
        SELECT COUNT(DISTINCT p.id)
        FROM projects p
        WHERE p.client_id = c.id
          AND p.tenant_id = ${tenantId}
          AND p.status = 'active'
      ) AS active_projects,
      COUNT(*) OVER() AS total_count
    FROM clients c
    WHERE c.tenant_id = ${tenantId}
      ${clientFilter}
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
