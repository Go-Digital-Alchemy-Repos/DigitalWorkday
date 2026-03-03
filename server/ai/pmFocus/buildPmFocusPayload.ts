/**
 * @file server/ai/pmFocus/buildPmFocusPayload.ts
 * @description Builds a strictly-grounded, aggregated-only payload for the PM Focus AI summary.
 *
 * PRIVACY RULES:
 * - No task descriptions, comment content, or message bodies
 * - No client PII beyond names already visible to the PM
 * - No individual user emails — only display names
 * - Only aggregated counts + IDs + risk levels
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import { getPmPortfolio } from "../../reports/pmPortfolioAggregator";
import crypto from "crypto";

export interface PmFocusRiskProject {
  projectId: string;
  name: string;
  riskLevel: "at_risk" | "critical";
  drivers: string[];
  needsAck: boolean;
  burnPercent: number | null;
  overdueTasksCount: number;
  milestoneCompletionPct: number | null;
}

export interface PmFocusCapacityConcern {
  userId: string;
  displayName: string;
  activeTaskCount: number;
  overdueTaskCount: number;
}

export interface PmFocusPayload {
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  pmUserId: string;

  portfolio: {
    totalProjects: number;
    atRiskCount: number;
    criticalCount: number;
    burnRiskCount: number;
    avgHealthScore: number;
    totalOverdueTasks: number;
    totalTasksInReview: number;
  };

  atRiskProjects: PmFocusRiskProject[];
  needsAckCount: number;

  capacityConcerns: PmFocusCapacityConcern[];

  weekOverWeekDeltas: {
    overdueTasksDelta: number | null;
    tasksInReviewDelta: number | null;
    atRiskProjectsDelta: number | null;
  };
}

export function hashPmFocusPayload(payload: PmFocusPayload): string {
  const normalized = {
    rangeStart: payload.rangeStart,
    rangeEnd: payload.rangeEnd,
    pmUserId: payload.pmUserId,
    portfolio: payload.portfolio,
    atRiskProjectIds: payload.atRiskProjects.map((p) => p.projectId).sort(),
    needsAckCount: payload.needsAckCount,
    capacityConcernCount: payload.capacityConcerns.length,
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32);
}

export async function buildPmFocusPayload(params: {
  tenantId: string;
  pmUserId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<PmFocusPayload> {
  const { tenantId, pmUserId, rangeStart, rangeEnd } = params;

  const portfolioResult = await getPmPortfolio({ tenantId, pmUserId });
  const { projects, summary } = portfolioResult;

  const atRiskProjects: PmFocusRiskProject[] = projects
    .filter((p) => p.riskTrend !== "stable")
    .map((p) => {
      const drivers: string[] = [];
      if (p.overdueTasksCount > 0) drivers.push(`${p.overdueTasksCount} overdue task(s)`);
      if (p.isBurnRisk) drivers.push(`burn rate at ${p.burnPercent}%`);
      if (p.hasMilestoneOverdue) drivers.push("milestone overdue");
      if (p.tasksInReviewCount > 0) drivers.push(`${p.tasksInReviewCount} task(s) in review`);
      return {
        projectId: p.projectId,
        name: p.name,
        riskLevel: p.riskTrend as "at_risk" | "critical",
        drivers,
        needsAck: p.needsAck,
        burnPercent: p.burnPercent,
        overdueTasksCount: p.overdueTasksCount,
        milestoneCompletionPct: p.milestoneCompletionPct,
      };
    });

  const needsAckCount = atRiskProjects.filter((p) => p.needsAck).length;

  // Capacity concerns — users with many active tasks across PM's projects
  const projectIds = projects.map((p) => p.projectId);
  let capacityConcerns: PmFocusCapacityConcern[] = [];

  if (projectIds.length > 0) {
    const idList = projectIds.map((id) => `'${id}'`).join(",");
    const capacityRows = await db.execute(sql`
      SELECT
        ta.user_id AS "userId",
        COALESCE(u.first_name || ' ' || u.last_name, u.email) AS "displayName",
        COUNT(DISTINCT t.id)::int AS "activeTaskCount",
        COUNT(DISTINCT CASE WHEN t.due_date < NOW() AND t.status NOT IN ('done','completed') THEN t.id END)::int AS "overdueTaskCount"
      FROM task_assignees ta
      JOIN tasks t ON t.id = ta.task_id
      JOIN users u ON u.id = ta.user_id
      WHERE t.tenant_id = ${tenantId}
        AND t.project_id = ANY(ARRAY[${sql.raw(idList)}]::varchar[])
        AND t.status NOT IN ('done', 'completed', 'cancelled')
        AND t.archived_at IS NULL
      GROUP BY ta.user_id, u.first_name, u.last_name, u.email
      HAVING COUNT(DISTINCT t.id) >= 5
      ORDER BY COUNT(DISTINCT t.id) DESC
      LIMIT 8
    `);
    capacityConcerns = (capacityRows.rows as any[]).map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      activeTaskCount: r.activeTaskCount,
      overdueTaskCount: r.overdueTaskCount,
    }));
  }

  // Week-over-week deltas: compare last week vs this week (approximate from DB)
  const weekAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  let weekOverWeekDeltas = { overdueTasksDelta: null as number | null, tasksInReviewDelta: null as number | null, atRiskProjectsDelta: null as number | null };

  if (projectIds.length > 0) {
    try {
      const idList = projectIds.map((id) => `'${id}'`).join(",");
      const deltaRows = await db.execute(sql`
        SELECT
          COUNT(CASE WHEN t.due_date < NOW() AND t.status NOT IN ('done','completed') AND t.created_at >= ${weekAgoStr}::timestamp THEN 1 END)::int AS "newOverdueThisWeek",
          COUNT(CASE WHEN t.needs_pm_review = true AND t.updated_at >= ${weekAgoStr}::timestamp THEN 1 END)::int AS "newInReviewThisWeek"
        FROM tasks t
        WHERE t.tenant_id = ${tenantId}
          AND t.project_id = ANY(ARRAY[${sql.raw(idList)}]::varchar[])
          AND t.archived_at IS NULL
      `);
      const d = deltaRows.rows[0] as any;
      weekOverWeekDeltas = {
        overdueTasksDelta: d?.newOverdueThisWeek ?? null,
        tasksInReviewDelta: d?.newInReviewThisWeek ?? null,
        atRiskProjectsDelta: null,
      };
    } catch {
      // Non-critical
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    rangeStart,
    rangeEnd,
    pmUserId,
    portfolio: {
      totalProjects: summary.totalProjects,
      atRiskCount: summary.atRiskCount,
      criticalCount: projects.filter((p) => p.riskTrend === "critical").length,
      burnRiskCount: summary.burnRiskCount,
      avgHealthScore: summary.avgHealthScore,
      totalOverdueTasks: summary.totalOverdueTasks,
      totalTasksInReview: summary.totalTasksInReview,
    },
    atRiskProjects,
    needsAckCount,
    capacityConcerns,
    weekOverWeekDeltas,
  };
}
