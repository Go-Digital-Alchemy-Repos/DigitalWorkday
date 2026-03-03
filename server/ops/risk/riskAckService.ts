/**
 * @file server/ops/risk/riskAckService.ts
 * @description Risk Acknowledgment Service for the governance workflow.
 *
 * Computes current risk state for a project, checks whether an acknowledgment
 * is needed, and persists acknowledgment records.
 *
 * Risk state computation reuses the same scoring logic as pmPortfolioAggregator
 * and whatIfEngine to ensure consistency.
 */

import { db } from "../../db";
import { projectRiskAcknowledgments, projects } from "@shared/schema";
import { sql } from "drizzle-orm";
import { AppError } from "../../lib/errors";

export type RiskLevel = "stable" | "at_risk" | "critical";

export interface ProjectRiskState {
  riskLevel: RiskLevel;
  riskScore: number;
  overdueCount: number;
  burnPercent: number | null;
  hasMilestoneOverdue: boolean;
  drivers: string[];
}

export interface RiskAckStatus {
  projectId: string;
  riskState: ProjectRiskState;
  needsAck: boolean;
  latestAck: AckRecord | null;
  ackWindowDays: number;
}

export interface AckRecord {
  id: string;
  riskLevel: string;
  riskScore: number | null;
  acknowledgedByUserId: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string;
  mitigationNote: string | null;
  nextCheckInDate: string | null;
}

const ACK_WINDOW_DAYS = 7;

/**
 * Compute the current risk state for a project using the same scoring
 * logic as the PM Portfolio aggregator.
 */
export async function getProjectRiskState(
  tenantId: string,
  projectId: string
): Promise<ProjectRiskState> {
  // Fetch project, overdue tasks, burn minutes, milestone overdue in parallel
  const [projectRows, overdueRows, burnRows, milestoneRows] = await Promise.all([
    db.execute(sql`
      SELECT id, budget_minutes
      FROM projects
      WHERE id = ${projectId} AND tenant_id = ${tenantId}
      LIMIT 1
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM tasks
      WHERE project_id = ${projectId}
        AND tenant_id = ${tenantId}
        AND status NOT IN ('done','completed','cancelled')
        AND due_date < now()
        AND archived_at IS NULL
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(duration_minutes), 0)::int AS total_minutes
      FROM time_entries
      WHERE project_id = ${projectId} AND tenant_id = ${tenantId}
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE due_date < now() AND status != 'completed')::int AS overdue_count
      FROM project_milestones
      WHERE project_id = ${projectId} AND tenant_id = ${tenantId}
    `),
  ]);

  const project = projectRows.rows[0] as { id: string; budget_minutes: number | null } | undefined;
  const overdueCount = (overdueRows.rows[0] as { cnt: number })?.cnt ?? 0;
  const burnMinutes = (burnRows.rows[0] as { total_minutes: number })?.total_minutes ?? 0;
  const milestoneData = milestoneRows.rows[0] as {
    total: number;
    completed: number;
    overdue_count: number;
  } | undefined;

  const budgetMinutes = project?.budget_minutes ?? null;
  const burnPercent =
    budgetMinutes && budgetMinutes > 0
      ? Math.round((burnMinutes / budgetMinutes) * 100)
      : null;
  const isBurnRisk = burnPercent !== null && burnPercent >= 80;
  const hasMilestoneOverdue = (milestoneData?.overdue_count ?? 0) > 0;

  const drivers: string[] = [];
  let healthScore = 100;

  if (overdueCount > 0) {
    healthScore -= Math.min(40, overdueCount * 10);
    drivers.push(`${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}`);
  }
  if (isBurnRisk) {
    healthScore -= 20;
    drivers.push(`Budget ${burnPercent}% consumed`);
  }
  if (hasMilestoneOverdue) {
    healthScore -= 20;
    drivers.push("Milestone overdue");
  }
  healthScore = Math.max(0, healthScore);

  let riskLevel: RiskLevel = "stable";
  if (healthScore < 40 || (overdueCount >= 3 && isBurnRisk)) {
    riskLevel = "critical";
  } else if (healthScore < 70 || overdueCount > 0 || isBurnRisk || hasMilestoneOverdue) {
    riskLevel = "at_risk";
  }

  return { riskLevel, riskScore: healthScore, overdueCount, burnPercent, hasMilestoneOverdue, drivers };
}

/**
 * Get the latest acknowledgment for a project.
 */
export async function getLatestAcknowledgment(
  tenantId: string,
  projectId: string
): Promise<AckRecord | null> {
  const rows = await db.execute(sql`
    SELECT
      a.id,
      a.risk_level,
      a.risk_score,
      a.acknowledged_by_user_id,
      a.acknowledged_at,
      a.mitigation_note,
      a.next_check_in_date,
      u.first_name,
      u.last_name,
      u.email
    FROM project_risk_acknowledgments a
    LEFT JOIN users u ON u.id = a.acknowledged_by_user_id
    WHERE a.tenant_id = ${tenantId}
      AND a.project_id = ${projectId}
    ORDER BY a.acknowledged_at DESC
    LIMIT 1
  `);

  if (rows.rows.length === 0) return null;

  const r = rows.rows[0] as {
    id: string;
    risk_level: string;
    risk_score: string | null;
    acknowledged_by_user_id: string | null;
    acknowledged_at: string;
    mitigation_note: string | null;
    next_check_in_date: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };

  const nameParts = [r.first_name, r.last_name].filter(Boolean);
  const acknowledgedByName =
    nameParts.length > 0 ? nameParts.join(" ") : r.email ?? null;

  return {
    id: r.id,
    riskLevel: r.risk_level,
    riskScore: r.risk_score ? parseFloat(r.risk_score) : null,
    acknowledgedByUserId: r.acknowledged_by_user_id,
    acknowledgedByName,
    acknowledgedAt: r.acknowledged_at,
    mitigationNote: r.mitigation_note,
    nextCheckInDate: r.next_check_in_date,
  };
}

/**
 * Determine if the project needs a new acknowledgment.
 * Condition: riskLevel !== 'stable' AND (no ack OR latest ack older than ACK_WINDOW_DAYS days).
 */
export async function getRiskAckStatus(
  tenantId: string,
  projectId: string
): Promise<RiskAckStatus> {
  const [riskState, latestAck] = await Promise.all([
    getProjectRiskState(tenantId, projectId),
    getLatestAcknowledgment(tenantId, projectId),
  ]);

  let needsAck = false;
  if (riskState.riskLevel !== "stable") {
    if (!latestAck) {
      needsAck = true;
    } else {
      const ackDate = new Date(latestAck.acknowledgedAt);
      const daysSinceAck = (Date.now() - ackDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAck >= ACK_WINDOW_DAYS) {
        needsAck = true;
      }
    }
    // If there's a nextCheckInDate, honor it as the next trigger date
    if (latestAck?.nextCheckInDate) {
      const checkIn = new Date(latestAck.nextCheckInDate);
      if (checkIn > new Date()) {
        needsAck = false;
      }
    }
  }

  return { projectId, riskState, needsAck, latestAck, ackWindowDays: ACK_WINDOW_DAYS };
}

/**
 * Record a risk acknowledgment from a PM or admin.
 */
export async function acknowledgeRisk(params: {
  tenantId: string;
  projectId: string;
  userId: string;
  mitigationNote?: string;
  nextCheckInDate?: string;
}): Promise<AckRecord> {
  const { tenantId, projectId, userId, mitigationNote, nextCheckInDate } = params;

  const riskState = await getProjectRiskState(tenantId, projectId);

  const [inserted] = await db
    .insert(projectRiskAcknowledgments)
    .values({
      tenantId,
      projectId,
      riskLevel: riskState.riskLevel,
      riskScore: riskState.riskScore.toString(),
      acknowledgedByUserId: userId,
      acknowledgedAt: new Date(),
      mitigationNote: mitigationNote || null,
      nextCheckInDate: nextCheckInDate || null,
    })
    .returning();

  return {
    id: inserted.id,
    riskLevel: inserted.riskLevel,
    riskScore: inserted.riskScore ? parseFloat(inserted.riskScore) : null,
    acknowledgedByUserId: inserted.acknowledgedByUserId,
    acknowledgedByName: null,
    acknowledgedAt: inserted.acknowledgedAt.toISOString(),
    mitigationNote: inserted.mitigationNote,
    nextCheckInDate: inserted.nextCheckInDate,
  };
}
