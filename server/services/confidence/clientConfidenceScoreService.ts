import { db } from "../../db";
import {
  projects,
  tasks,
  projectMilestones,
  projectRiskAcknowledgments,
  timeEntries,
} from "../../../shared/schema";
import { and, eq, inArray, isNull, sql, desc, lt, ne } from "drizzle-orm";

export interface ConfidenceDriver {
  key: string;
  label: string;
  impact: number;
  severity: "low" | "medium" | "high";
  evidence: Record<string, number | string>;
}

export interface ConfidenceComponentScores {
  communication: number;
  delivery: number;
  risk: number;
  financial: number;
}

export interface ConfidenceScore {
  score: number;
  tier: "Strong" | "Stable" | "At Risk" | "Critical";
  drivers: ConfidenceDriver[];
  componentScores: ConfidenceComponentScores;
  projectCount: number;
  computedAt: string;
}

interface ScoreInput {
  tenantId: string;
  clientId?: string;
  projectId?: string;
  viewerUserId: string;
}

const cache = new Map<string, { value: ConfidenceScore; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCacheKey(input: ScoreInput): string {
  return `${input.tenantId}:${input.clientId ?? ""}:${input.projectId ?? ""}`;
}

function tierFromScore(score: number): ConfidenceScore["tier"] {
  if (score >= 75) return "Strong";
  if (score >= 50) return "Stable";
  if (score >= 25) return "At Risk";
  return "Critical";
}

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

export async function computeClientConfidenceScore(input: ScoreInput): Promise<ConfidenceScore> {
  const cacheKey = getCacheKey(input);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const result = await _compute(input);

  cache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export function invalidateConfidenceCache(tenantId: string, clientId?: string, projectId?: string) {
  const key = `${tenantId}:${clientId ?? ""}:${projectId ?? ""}`;
  cache.delete(key);
}

async function _compute(input: ScoreInput): Promise<ConfidenceScore> {
  const { tenantId, clientId, projectId } = input;
  const now = new Date();

  let projectList: { id: string; lastClientContactAt: Date | null; lastStatusReportAt: Date | null; budgetMinutes: number | null; status: string; name: string }[] = [];

  if (projectId) {
    const [p] = await db.select({
      id: projects.id,
      lastClientContactAt: projects.lastClientContactAt,
      lastStatusReportAt: projects.lastStatusReportAt,
      budgetMinutes: projects.budgetMinutes,
      status: projects.status,
      name: projects.name,
    }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
      .limit(1);
    if (p) projectList = [p];
  } else if (clientId) {
    projectList = await db.select({
      id: projects.id,
      lastClientContactAt: projects.lastClientContactAt,
      lastStatusReportAt: projects.lastStatusReportAt,
      budgetMinutes: projects.budgetMinutes,
      status: projects.status,
      name: projects.name,
    }).from(projects)
      .where(and(
        eq(projects.clientId, clientId),
        eq(projects.tenantId, tenantId),
        ne(projects.status, "archived"),
      ));
  }

  if (projectList.length === 0) {
    return { score: 100, tier: "Strong", drivers: [], componentScores: { communication: 100, delivery: 100, risk: 100, financial: 100 }, projectCount: 0, computedAt: now.toISOString() };
  }

  const projectIds = projectList.map(p => p.id);

  const [taskStatsRows, milestoneStatsRows, riskAckRows, timeStatsRows] = await Promise.all([
    db.select({
      projectId: tasks.projectId,
      overdueCount: sql<number>`count(*) filter (where ${tasks.dueDate} < ${now} and ${tasks.status} != 'done')`.mapWith(Number),
      openCount: sql<number>`count(*) filter (where ${tasks.status} != 'done')`.mapWith(Number),
    }).from(tasks)
      .where(and(inArray(tasks.projectId, projectIds), isNull(tasks.archivedAt), isNull(tasks.parentTaskId)))
      .groupBy(tasks.projectId),

    db.select({
      projectId: projectMilestones.projectId,
      overdueCount: sql<number>`count(*) filter (where ${projectMilestones.dueDate} < ${now} and ${projectMilestones.status} != 'completed')`.mapWith(Number),
      totalCount: sql<number>`count(*)`.mapWith(Number),
    }).from(projectMilestones)
      .where(inArray(projectMilestones.projectId, projectIds))
      .groupBy(projectMilestones.projectId),

    db.select({
      projectId: projectRiskAcknowledgments.projectId,
      riskLevel: projectRiskAcknowledgments.riskLevel,
      acknowledgedAt: projectRiskAcknowledgments.acknowledgedAt,
    }).from(projectRiskAcknowledgments)
      .where(and(
        inArray(projectRiskAcknowledgments.projectId, projectIds),
        eq(projectRiskAcknowledgments.tenantId, tenantId),
      ))
      .orderBy(desc(projectRiskAcknowledgments.acknowledgedAt)),

    db.select({
      projectId: timeEntries.projectId,
      totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0) / 60`.mapWith(Number),
    }).from(timeEntries)
      .where(and(inArray(timeEntries.projectId, projectIds), eq(timeEntries.tenantId, tenantId)))
      .groupBy(timeEntries.projectId),
  ]);

  const taskStatsByProject = new Map(taskStatsRows.map(r => [r.projectId, r]));
  const milestoneStatsByProject = new Map(milestoneStatsRows.map(r => [r.projectId, r]));
  const riskAckByProject = new Map<string, typeof riskAckRows[0]>();
  for (const r of riskAckRows) {
    if (!riskAckByProject.has(r.projectId)) riskAckByProject.set(r.projectId, r);
  }
  const timeStatsByProject = new Map(timeStatsRows.map(r => [r.projectId, r]));

  const drivers: ConfidenceDriver[] = [];
  let commPenalty = 0;
  let deliveryPenalty = 0;
  let riskPenalty = 0;
  let financialPenalty = 0;

  for (const p of projectList) {
    const taskStats = taskStatsByProject.get(p.id);
    const milestoneStats = milestoneStatsByProject.get(p.id);
    const riskAck = riskAckByProject.get(p.id);
    const timeStats = timeStatsByProject.get(p.id);

    const days = daysSince(p.lastClientContactAt);
    if (days === null || days > 21) {
      const penalty = days === null ? 25 : days > 21 ? 25 : days > 14 ? 16 : 8;
      commPenalty = Math.max(commPenalty, penalty);
      drivers.push({
        key: "stale_communication",
        label: "No recent client contact",
        impact: -penalty,
        severity: penalty >= 20 ? "high" : penalty >= 12 ? "medium" : "low",
        evidence: { daysSinceLastContact: days ?? -1 },
      });
    } else if (days > 14) {
      commPenalty = Math.max(commPenalty, 16);
      drivers.push({
        key: "stale_communication",
        label: "Client contact overdue",
        impact: -16,
        severity: "medium",
        evidence: { daysSinceLastContact: days },
      });
    } else if (days > 7) {
      commPenalty = Math.max(commPenalty, 8);
      drivers.push({
        key: "aging_communication",
        label: "Client contact aging",
        impact: -8,
        severity: "low",
        evidence: { daysSinceLastContact: days },
      });
    }

    const reportDays = daysSince(p.lastStatusReportAt);
    if (reportDays === null || reportDays > 7) {
      commPenalty = Math.max(commPenalty, commPenalty + 10);
      drivers.push({
        key: "missed_status_report",
        label: "Status report overdue",
        impact: -10,
        severity: "medium",
        evidence: { daysSinceLastReport: reportDays ?? -1 },
      });
    }

    if (taskStats && taskStats.openCount > 0) {
      const ratio = taskStats.overdueCount / taskStats.openCount;
      if (ratio > 0.2) {
        deliveryPenalty = Math.max(deliveryPenalty, 15);
        drivers.push({
          key: "high_overdue_task_ratio",
          label: "High overdue task ratio",
          impact: -15,
          severity: "high",
          evidence: { overdueTasks: taskStats.overdueCount, openTasks: taskStats.openCount, ratio: Math.round(ratio * 100) },
        });
      } else if (ratio > 0.1) {
        deliveryPenalty = Math.max(deliveryPenalty, 8);
        drivers.push({
          key: "elevated_overdue_tasks",
          label: "Elevated overdue tasks",
          impact: -8,
          severity: "medium",
          evidence: { overdueTasks: taskStats.overdueCount, openTasks: taskStats.openCount, ratio: Math.round(ratio * 100) },
        });
      }
    }

    if (milestoneStats && milestoneStats.overdueCount > 0) {
      const penalty = Math.min(18, milestoneStats.overdueCount * 6);
      deliveryPenalty = Math.max(deliveryPenalty, deliveryPenalty + penalty);
      drivers.push({
        key: "overdue_milestones",
        label: "Overdue milestones",
        impact: -penalty,
        severity: milestoneStats.overdueCount >= 3 ? "high" : "medium",
        evidence: { overdueMilestones: milestoneStats.overdueCount },
      });
    }

    if (riskAck) {
      const ackDays = daysSince(riskAck.acknowledgedAt);
      const recentRisk = ackDays !== null && ackDays <= 30;
      if (recentRisk) {
        const rl = riskAck.riskLevel;
        const penalty = rl === "critical" ? 20 : rl === "high" ? 15 : rl === "medium" ? 8 : 5;
        riskPenalty = Math.max(riskPenalty, penalty);
        drivers.push({
          key: "active_risk_flag",
          label: "Active project risk flag",
          impact: -penalty,
          severity: rl === "critical" || rl === "high" ? "high" : "medium",
          evidence: { riskLevel: rl, daysSinceAck: ackDays ?? 0 },
        });
      }
    }

    if (p.budgetMinutes && p.budgetMinutes > 0 && timeStats) {
      const utilizationPct = (timeStats.totalMinutes / p.budgetMinutes) * 100;
      if (utilizationPct > 100) {
        financialPenalty = Math.max(financialPenalty, 10);
        drivers.push({
          key: "budget_overrun",
          label: "Budget overrun",
          impact: -10,
          severity: "high",
          evidence: { utilizationPct: Math.round(utilizationPct) },
        });
      } else if (utilizationPct > 90) {
        financialPenalty = Math.max(financialPenalty, 8);
        drivers.push({
          key: "budget_burn_risk",
          label: "Budget nearing limit",
          impact: -8,
          severity: "medium",
          evidence: { utilizationPct: Math.round(utilizationPct) },
        });
      }
    }
  }

  const dedupedDrivers = dedupeDrivers(drivers);

  const commScore = Math.max(0, 100 - commPenalty);
  const deliveryScore = Math.max(0, 100 - deliveryPenalty);
  const riskScore = Math.max(0, 100 - riskPenalty);
  const financialScore = Math.max(0, 100 - financialPenalty);

  const totalPenalty = commPenalty * 0.35 + deliveryPenalty * 0.35 + riskPenalty * 0.20 + financialPenalty * 0.10;
  const score = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));

  return {
    score,
    tier: tierFromScore(score),
    drivers: dedupedDrivers.sort((a, b) => a.impact - b.impact),
    componentScores: {
      communication: Math.round(commScore),
      delivery: Math.round(deliveryScore),
      risk: Math.round(riskScore),
      financial: Math.round(financialScore),
    },
    projectCount: projectList.length,
    computedAt: now.toISOString(),
  };
}

function dedupeDrivers(drivers: ConfidenceDriver[]): ConfidenceDriver[] {
  const seen = new Map<string, ConfidenceDriver>();
  for (const d of drivers) {
    const existing = seen.get(d.key);
    if (!existing || d.impact < existing.impact) {
      seen.set(d.key, d);
    }
  }
  return Array.from(seen.values());
}
