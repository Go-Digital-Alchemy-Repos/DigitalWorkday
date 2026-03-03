import { db } from "../db";
import { sql } from "drizzle-orm";

export interface PmPortfolioProject {
  projectId: string;
  name: string;
  status: string;
  color: string | null;
  clientName: string | null;
  healthScore: number;
  milestoneCompletionPct: number | null;
  burnPercent: number | null;
  isBurnRisk: boolean;
  overdueTasksCount: number;
  tasksInReviewCount: number;
  hasMilestoneOverdue: boolean;
  riskTrend: "stable" | "at_risk" | "critical";
  needsAck: boolean;
}

export interface PmPortfolioSummary {
  totalProjects: number;
  atRiskCount: number;
  burnRiskCount: number;
  avgHealthScore: number;
  totalOverdueTasks: number;
  totalTasksInReview: number;
}

export interface PmPortfolioResult {
  projects: PmPortfolioProject[];
  summary: PmPortfolioSummary;
}

async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

export async function getPmPortfolio(params: {
  tenantId: string;
  pmUserId: string;
  dateRange?: { startDate: Date; endDate: Date };
}): Promise<PmPortfolioResult> {
  const { tenantId, pmUserId } = params;

  const [projectRows, overdueRows, burnRows, milestoneRows, reviewRows] = await Promise.all([
    dbRows<{
      projectId: string;
      name: string;
      status: string;
      color: string | null;
      budgetMinutes: number | null;
      clientName: string | null;
    }>(sql`
      SELECT
        p.id           AS "projectId",
        p.name,
        p.status,
        p.color,
        p.budget_minutes AS "budgetMinutes",
        c.company_name AS "clientName"
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
        AND pm.user_id = ${pmUserId}
        AND pm.role = 'owner'
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.tenant_id = ${tenantId}
        AND p.status != 'archived'
      ORDER BY p.name ASC
    `),

    dbRows<{ projectId: string; overdueCount: string }>(sql`
      SELECT
        t.project_id AS "projectId",
        COUNT(t.id)::text AS "overdueCount"
      FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
        AND pm.user_id = ${pmUserId}
        AND pm.role = 'owner'
      WHERE t.tenant_id = ${tenantId}
        AND t.due_date < NOW()
        AND t.status NOT IN ('done', 'completed')
      GROUP BY t.project_id
    `),

    dbRows<{ projectId: string; burnMinutes: string }>(sql`
      SELECT
        t.project_id AS "projectId",
        COALESCE(SUM(te.duration_seconds) / 60, 0)::text AS "burnMinutes"
      FROM time_entries te
      JOIN tasks t ON t.id = te.task_id
      JOIN project_members pm ON pm.project_id = t.project_id
        AND pm.user_id = ${pmUserId}
        AND pm.role = 'owner'
      WHERE te.tenant_id = ${tenantId}
        AND t.project_id IS NOT NULL
      GROUP BY t.project_id
    `),

    dbRows<{
      projectId: string;
      totalMilestones: string;
      completedMilestones: string;
      hasOverdue: string;
    }>(sql`
      SELECT
        pm2.project_id AS "projectId",
        COUNT(pm2.id)::text AS "totalMilestones",
        COUNT(CASE WHEN pm2.status = 'completed' THEN 1 END)::text AS "completedMilestones",
        MAX(CASE WHEN pm2.due_date < NOW() AND pm2.status != 'completed' THEN 1 ELSE 0 END)::text AS "hasOverdue"
      FROM project_milestones pm2
      JOIN project_members pmem ON pmem.project_id = pm2.project_id
        AND pmem.user_id = ${pmUserId}
        AND pmem.role = 'owner'
      WHERE pm2.tenant_id = ${tenantId}
      GROUP BY pm2.project_id
    `),

    dbRows<{ projectId: string; reviewCount: string }>(sql`
      SELECT
        t.project_id AS "projectId",
        COUNT(t.id)::text AS "reviewCount"
      FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
        AND pm.user_id = ${pmUserId}
        AND pm.role = 'owner'
      WHERE t.tenant_id = ${tenantId}
        AND t.needs_pm_review = true
      GROUP BY t.project_id
    `),
  ]);

  const overdueByProject = new Map<string, number>();
  for (const r of overdueRows) {
    overdueByProject.set(r.projectId, parseInt(r.overdueCount, 10) || 0);
  }

  const burnByProject = new Map<string, number>();
  for (const r of burnRows) {
    burnByProject.set(r.projectId, parseFloat(r.burnMinutes) || 0);
  }

  const milestoneByProject = new Map<string, {
    total: number;
    completed: number;
    hasOverdue: boolean;
  }>();
  for (const r of milestoneRows) {
    milestoneByProject.set(r.projectId, {
      total: parseInt(r.totalMilestones, 10) || 0,
      completed: parseInt(r.completedMilestones, 10) || 0,
      hasOverdue: parseInt(r.hasOverdue, 10) > 0,
    });
  }

  const reviewByProject = new Map<string, number>();
  for (const r of reviewRows) {
    reviewByProject.set(r.projectId, parseInt(r.reviewCount, 10) || 0);
  }

  const projects: PmPortfolioProject[] = projectRows.map((p) => {
    const overdueCount = overdueByProject.get(p.projectId) ?? 0;
    const burnMinutes = burnByProject.get(p.projectId) ?? 0;
    const milestones = milestoneByProject.get(p.projectId);
    const reviewCount = reviewByProject.get(p.projectId) ?? 0;

    const budgetMinutes = p.budgetMinutes ?? null;
    const burnPercent = budgetMinutes && budgetMinutes > 0
      ? Math.round((burnMinutes / budgetMinutes) * 100)
      : null;
    const isBurnRisk = burnPercent !== null && burnPercent >= 80;

    const milestoneCompletionPct = milestones && milestones.total > 0
      ? Math.round((milestones.completed / milestones.total) * 100)
      : null;
    const hasMilestoneOverdue = milestones?.hasOverdue ?? false;

    let healthScore = 100;
    if (overdueCount > 0) healthScore -= Math.min(40, overdueCount * 10);
    if (isBurnRisk) healthScore -= 20;
    if (hasMilestoneOverdue) healthScore -= 20;
    if (reviewCount > 0) healthScore -= Math.min(10, reviewCount * 5);
    healthScore = Math.max(0, healthScore);

    let riskTrend: "stable" | "at_risk" | "critical" = "stable";
    if (healthScore < 40 || (overdueCount >= 3 && isBurnRisk)) {
      riskTrend = "critical";
    } else if (healthScore < 70 || overdueCount > 0 || isBurnRisk || hasMilestoneOverdue) {
      riskTrend = "at_risk";
    }

    return {
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      color: p.color,
      clientName: p.clientName,
      healthScore,
      milestoneCompletionPct,
      burnPercent,
      isBurnRisk,
      overdueTasksCount: overdueCount,
      tasksInReviewCount: reviewCount,
      hasMilestoneOverdue,
      riskTrend,
      needsAck: false, // filled in below
    };
  });

  // Batch-check ack status for all at-risk/critical projects
  const atRiskProjectIds = projects
    .filter((p) => p.riskTrend !== "stable")
    .map((p) => p.projectId);

  if (atRiskProjectIds.length > 0) {
    const ACK_WINDOW_DAYS = 7;
    const ackRows = await dbRows<{ project_id: string; latest_ack_at: string; next_check_in_date: string | null }>(sql`
      SELECT DISTINCT ON (project_id)
        project_id,
        acknowledged_at AS latest_ack_at,
        next_check_in_date
      FROM project_risk_acknowledgments
      WHERE tenant_id = ${tenantId}
        AND project_id = ANY(ARRAY[${sql.raw(atRiskProjectIds.map((id) => `'${id}'`).join(","))}]::varchar[])
      ORDER BY project_id, acknowledged_at DESC
    `);

    const ackByProject = new Map(ackRows.map((r) => [r.project_id, r]));

    for (const p of projects) {
      if (p.riskTrend === "stable") continue;
      const ack = ackByProject.get(p.projectId);
      if (!ack) {
        p.needsAck = true;
      } else {
        const ackDate = new Date(ack.latest_ack_at);
        const daysSince = (Date.now() - ackDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ack.next_check_in_date && new Date(ack.next_check_in_date) > new Date()) {
          p.needsAck = false;
        } else if (daysSince >= ACK_WINDOW_DAYS) {
          p.needsAck = true;
        }
      }
    }
  }

  const summary: PmPortfolioSummary = {
    totalProjects: projects.length,
    atRiskCount: projects.filter((p) => p.riskTrend !== "stable").length,
    burnRiskCount: projects.filter((p) => p.isBurnRisk).length,
    avgHealthScore: projects.length > 0
      ? Math.round(projects.reduce((sum, p) => sum + p.healthScore, 0) / projects.length)
      : 100,
    totalOverdueTasks: projects.reduce((sum, p) => sum + p.overdueTasksCount, 0),
    totalTasksInReview: projects.reduce((sum, p) => sum + p.tasksInReviewCount, 0),
  };

  return { projects, summary };
}
