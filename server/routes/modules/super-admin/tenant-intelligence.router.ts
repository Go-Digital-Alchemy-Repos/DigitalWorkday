import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { getTenantHealthSummary } from '../../../services/tenancyHealth';

export const tenantIntelligenceRouter = Router();

interface FinancialSummary {
  totalHoursTracked: number;
  billableHours: number;
  nonBillableHours: number;
  billablePercent: number;
  estimatedRevenue: number;
  estimatedCost: number;
  estimatedMargin: number;
  marginPercent: number;
  budgetBurn: {
    totalBudgetMinutes: number;
    totalUsedMinutes: number;
    burnPercent: number;
    projectsOverBudget: number;
    totalProjectsWithBudget: number;
  };
}

interface HealthScore {
  overall: number;
  overdueTaskRatio: number;
  projectCompletionRate: number;
  activeUserRatio: number;
  avgTasksPerUser: number;
  riskLevel: 'stable' | 'at_risk' | 'critical';
  dataIntegrity: {
    isClean: boolean;
    issueCount: number;
    criticalCount: number;
    warningCount: number;
  };
  factors: {
    name: string;
    score: number;
    weight: number;
  }[];
}

interface ActivityMetrics {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalClients: number;
  totalTimeEntries: number;
  recentTasksCreated7d: number;
  recentTimeEntries7d: number;
}

interface PlatformBenchmark {
  tenantRank: number;
  totalTenants: number;
  avgUsersPerTenant: number;
  avgProjectsPerTenant: number;
  avgTasksPerTenant: number;
  avgHoursPerTenant: number;
  avgCompletionRate: number;
  avgOverdueRatio: number;
  tenantUsersVsAvg: number;
  tenantProjectsVsAvg: number;
  tenantTasksVsAvg: number;
  tenantHoursVsAvg: number;
}

interface AdminActions {
  recentNotes: {
    id: string;
    body: string;
    category: string;
    authorName: string;
    createdAt: string;
  }[];
  recentAuditEvents: {
    id: string;
    eventType: string;
    message: string;
    actorName: string | null;
    createdAt: string;
  }[];
  riskAcknowledgments: {
    id: string;
    projectId: string;
    projectName: string;
    riskLevel: string;
    acknowledgedByName: string | null;
    acknowledgedAt: string;
    mitigationNote: string | null;
  }[];
  tenancyWarnings: {
    checkName: string;
    severity: string;
    count: number;
  }[];
}

interface TenantIntelligenceResponse {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  financial: FinancialSummary;
  health: HealthScore;
  activity: ActivityMetrics;
  benchmark: PlatformBenchmark;
  adminActions: AdminActions;
}

async function queryRows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

tenantIntelligenceRouter.get(
  '/tenant-intelligence/:tenantId',
  requireSuperUser,
  async (req, res) => {
    try {
      const { tenantId } = req.params;

      if (!tenantId || tenantId.length < 5 || tenantId.length > 100) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      const [
        tenantRows,
        userRows,
        projectRows,
        taskRows,
        timeRows,
        clientRows,
        recentActivityRows,
        benchmarkRows,
        budgetBurnRows,
        noteRows,
        auditRows,
        riskAckRows,
        projectHealthRows,
        tenantHealthResult,
      ] = await Promise.all([
        queryRows<{ name: string; status: string }>(sql`
          SELECT name, status FROM tenants WHERE id = ${tenantId} LIMIT 1
        `),

        queryRows<{
          total: string;
          active: string;
        }>(sql`
          SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE is_active = true)::text AS active
          FROM users
          WHERE tenant_id = ${tenantId} AND role != 'super_user'
        `),

        queryRows<{
          total: string;
          active: string;
          completed: string;
        }>(sql`
          SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status = 'active')::text AS active,
            COUNT(*) FILTER (WHERE status = 'completed')::text AS completed
          FROM projects
          WHERE tenant_id = ${tenantId}
        `),

        queryRows<{
          total: string;
          completed: string;
          overdue: string;
        }>(sql`
          SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status IN ('done', 'completed'))::text AS completed,
            COUNT(*) FILTER (
              WHERE due_date < NOW()
                AND status NOT IN ('done', 'completed', 'cancelled')
                AND archived_at IS NULL
            )::text AS overdue
          FROM tasks
          WHERE tenant_id = ${tenantId}
        `),

        queryRows<{
          total_entries: string;
          total_seconds: string;
          billable_seconds: string;
          estimated_revenue: string;
          estimated_cost: string;
        }>(sql`
          SELECT
            COUNT(te.id)::text AS total_entries,
            COALESCE(SUM(te.duration_seconds), 0)::text AS total_seconds,
            COALESCE(SUM(
              CASE WHEN te.scope = 'out_of_scope'
                THEN te.duration_seconds ELSE 0 END
            ), 0)::text AS billable_seconds,
            0::text AS estimated_revenue,
            0::text AS estimated_cost
          FROM time_entries te
          WHERE te.tenant_id = ${tenantId}
        `),

        queryRows<{ total: string }>(sql`
          SELECT COUNT(*)::text AS total
          FROM clients
          WHERE tenant_id = ${tenantId}
        `),

        queryRows<{
          recent_tasks: string;
          recent_time_entries: string;
        }>(sql`
          SELECT
            (SELECT COUNT(*)::text FROM tasks
             WHERE tenant_id = ${tenantId}
               AND created_at >= NOW() - INTERVAL '7 days') AS recent_tasks,
            (SELECT COUNT(*)::text FROM time_entries
             WHERE tenant_id = ${tenantId}
               AND start_time >= NOW() - INTERVAL '7 days') AS recent_time_entries
        `),

        queryRows<{
          tenant_count: string;
          avg_users: string;
          avg_projects: string;
          avg_tasks: string;
          avg_hours: string;
          avg_completion_rate: string;
          avg_overdue_ratio: string;
          tenant_rank: string;
        }>(sql`
          WITH tenant_stats AS (
            SELECT
              t.id AS tid,
              (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND role != 'super_user') AS user_count,
              (SELECT COUNT(*) FROM projects WHERE tenant_id = t.id) AS project_count,
              (SELECT COUNT(*) FROM tasks WHERE tenant_id = t.id) AS task_count,
              (SELECT COUNT(*) FILTER (WHERE status IN ('done', 'completed')) FROM tasks WHERE tenant_id = t.id) AS completed_count,
              (SELECT COUNT(*) FILTER (
                WHERE due_date < NOW()
                  AND status NOT IN ('done', 'completed', 'cancelled')
                  AND archived_at IS NULL
              ) FROM tasks WHERE tenant_id = t.id) AS overdue_count,
              (SELECT COALESCE(SUM(duration_seconds), 0) FROM time_entries WHERE tenant_id = t.id) AS total_seconds
            FROM tenants t
            WHERE t.status = 'active'
          ),
          ranked AS (
            SELECT
              tid,
              RANK() OVER (ORDER BY total_seconds DESC) AS rnk
            FROM tenant_stats
          )
          SELECT
            (SELECT COUNT(*)::text FROM tenant_stats) AS tenant_count,
            (SELECT ROUND(AVG(user_count))::text FROM tenant_stats) AS avg_users,
            (SELECT ROUND(AVG(project_count))::text FROM tenant_stats) AS avg_projects,
            (SELECT ROUND(AVG(task_count))::text FROM tenant_stats) AS avg_tasks,
            (SELECT ROUND(AVG(total_seconds / 3600.0), 1)::text FROM tenant_stats) AS avg_hours,
            (SELECT ROUND(AVG(CASE WHEN task_count > 0 THEN (completed_count::numeric / task_count) * 100 ELSE 0 END), 1)::text FROM tenant_stats) AS avg_completion_rate,
            (SELECT ROUND(AVG(CASE WHEN (task_count - completed_count) > 0 THEN (overdue_count::numeric / (task_count - completed_count)) * 100 ELSE 0 END), 1)::text FROM tenant_stats) AS avg_overdue_ratio,
            COALESCE((SELECT rnk::text FROM ranked WHERE tid = ${tenantId}), '0') AS tenant_rank
        `),

        queryRows<{
          total_budget_minutes: string;
          total_used_minutes: string;
          projects_over_budget: string;
          total_with_budget: string;
        }>(sql`
          WITH project_budgets AS (
            SELECT
              p.id,
              p.budget_minutes,
              COALESCE(
                (SELECT SUM(te.duration_seconds) / 60.0
                 FROM time_entries te
                 WHERE te.project_id = p.id),
                0
              ) AS used_minutes
            FROM projects p
            WHERE p.tenant_id = ${tenantId}
              AND p.budget_minutes IS NOT NULL
              AND p.budget_minutes > 0
          )
          SELECT
            COALESCE(SUM(budget_minutes), 0)::text AS total_budget_minutes,
            COALESCE(SUM(used_minutes), 0)::text AS total_used_minutes,
            COUNT(*) FILTER (WHERE used_minutes > budget_minutes)::text AS projects_over_budget,
            COUNT(*)::text AS total_with_budget
          FROM project_budgets
        `),

        queryRows<{
          id: string;
          body: string;
          category: string;
          author_name: string;
          created_at: string;
        }>(sql`
          SELECT
            tn.id,
            tn.body,
            COALESCE(tn.category, 'general') AS category,
            COALESCE(u.name, 'System') AS author_name,
            tn.created_at::text AS created_at
          FROM tenant_notes tn
          LEFT JOIN users u ON u.id = tn.author_user_id
          WHERE tn.tenant_id = ${tenantId}
          ORDER BY tn.created_at DESC
          LIMIT 10
        `),

        queryRows<{
          id: string;
          event_type: string;
          message: string;
          actor_name: string | null;
          created_at: string;
        }>(sql`
          SELECT
            tae.id,
            tae.event_type,
            tae.message,
            u.name AS actor_name,
            tae.created_at::text AS created_at
          FROM tenant_audit_events tae
          LEFT JOIN users u ON u.id = tae.actor_user_id
          WHERE tae.tenant_id = ${tenantId}
          ORDER BY tae.created_at DESC
          LIMIT 10
        `),

        queryRows<{
          id: string;
          project_id: string;
          project_name: string;
          risk_level: string;
          acknowledged_by_name: string | null;
          acknowledged_at: string;
          mitigation_note: string | null;
        }>(sql`
          SELECT
            pra.id,
            pra.project_id,
            COALESCE(p.name, 'Unknown Project') AS project_name,
            pra.risk_level,
            u.name AS acknowledged_by_name,
            pra.acknowledged_at::text AS acknowledged_at,
            pra.mitigation_note
          FROM project_risk_acknowledgments pra
          LEFT JOIN projects p ON p.id = pra.project_id
          LEFT JOIN users u ON u.id = pra.acknowledged_by_user_id
          WHERE pra.tenant_id = ${tenantId}
          ORDER BY pra.acknowledged_at DESC
          LIMIT 10
        `),

        queryRows<{
          total_projects: string;
          at_risk_projects: string;
        }>(sql`
          SELECT
            COUNT(DISTINCT p.id)::text AS total_projects,
            COUNT(DISTINCT pra.project_id) FILTER (
              WHERE pra.acknowledged_at >= NOW() - INTERVAL '30 days'
            )::text AS at_risk_projects
          FROM projects p
          LEFT JOIN project_risk_acknowledgments pra ON pra.project_id = p.id
          WHERE p.tenant_id = ${tenantId}
            AND p.status = 'active'
        `),

        getTenantHealthSummary(tenantId).catch(() => null),
      ]);

      const tenant = tenantRows[0];
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const userStats = userRows[0] || { total: '0', active: '0' };
      const projStats = projectRows[0] || { total: '0', active: '0', completed: '0' };
      const taskStats = taskRows[0] || { total: '0', completed: '0', overdue: '0' };
      const timeStats = timeRows[0] || { total_entries: '0', total_seconds: '0', billable_seconds: '0', estimated_revenue: '0', estimated_cost: '0' };
      const clientStats = clientRows[0] || { total: '0' };
      const recentStats = recentActivityRows[0] || { recent_tasks: '0', recent_time_entries: '0' };
      const benchStats = benchmarkRows[0] || { tenant_count: '0', avg_users: '0', avg_projects: '0', avg_tasks: '0', avg_hours: '0', avg_completion_rate: '0', avg_overdue_ratio: '0', tenant_rank: '0' };
      const budgetStats = budgetBurnRows[0] || { total_budget_minutes: '0', total_used_minutes: '0', projects_over_budget: '0', total_with_budget: '0' };

      const totalSeconds = parseFloat(timeStats.total_seconds) || 0;
      const billableSeconds = parseFloat(timeStats.billable_seconds) || 0;
      const nonBillableSeconds = totalSeconds - billableSeconds;
      const totalHours = totalSeconds / 3600;
      const billableHours = billableSeconds / 3600;
      const nonBillableHours = nonBillableSeconds / 3600;
      const estimatedRevenue = parseFloat(timeStats.estimated_revenue) || 0;
      const estimatedCost = parseFloat(timeStats.estimated_cost) || 0;
      const estimatedMargin = estimatedRevenue - estimatedCost;

      const totalBudgetMinutes = parseFloat(budgetStats.total_budget_minutes) || 0;
      const totalUsedMinutes = parseFloat(budgetStats.total_used_minutes) || 0;

      const financial: FinancialSummary = {
        totalHoursTracked: Math.round(totalHours * 10) / 10,
        billableHours: Math.round(billableHours * 10) / 10,
        nonBillableHours: Math.round(nonBillableHours * 10) / 10,
        billablePercent: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
        estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
        estimatedMargin: Math.round(estimatedMargin * 100) / 100,
        marginPercent: estimatedRevenue > 0 ? Math.round((estimatedMargin / estimatedRevenue) * 100) : 0,
        budgetBurn: {
          totalBudgetMinutes: Math.round(totalBudgetMinutes),
          totalUsedMinutes: Math.round(totalUsedMinutes),
          burnPercent: totalBudgetMinutes > 0 ? Math.round((totalUsedMinutes / totalBudgetMinutes) * 100) : 0,
          projectsOverBudget: parseInt(budgetStats.projects_over_budget) || 0,
          totalProjectsWithBudget: parseInt(budgetStats.total_with_budget) || 0,
        },
      };

      const totalUsers = parseInt(userStats.total) || 0;
      const activeUsers = parseInt(userStats.active) || 0;
      const totalTasks = parseInt(taskStats.total) || 0;
      const completedTasks = parseInt(taskStats.completed) || 0;
      const overdueTasks = parseInt(taskStats.overdue) || 0;
      const totalProjects = parseInt(projStats.total) || 0;
      const activeProjects = parseInt(projStats.active) || 0;
      const completedProjects = parseInt(projStats.completed) || 0;

      const openTasks = totalTasks - completedTasks;
      const overdueRatio = openTasks > 0 ? overdueTasks / openTasks : 0;
      const projCompletionRate = totalProjects > 0 ? completedProjects / totalProjects : 0;
      const activeUserRatio = totalUsers > 0 ? activeUsers / totalUsers : 0;
      const avgTasksPerUser = activeUsers > 0 ? totalTasks / activeUsers : 0;
      const taskCompletionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
      const recentActivity = parseInt(recentStats.recent_tasks) + parseInt(recentStats.recent_time_entries);

      const dataIntegrityClean = tenantHealthResult ? tenantHealthResult.blockerCount === 0 : true;
      const dataIntegrityCritical = tenantHealthResult ? tenantHealthResult.checks.filter(c => c.severity === 'critical').length : 0;
      const dataIntegrityWarning = tenantHealthResult ? tenantHealthResult.checks.filter(c => c.severity === 'warning').length : 0;
      const dataIntegrityIssueCount = dataIntegrityCritical + dataIntegrityWarning;

      const projHealthStats = projectHealthRows[0] || { total_projects: '0', at_risk_projects: '0' };
      const activeProjectCount = parseInt(projHealthStats.total_projects) || 0;
      const atRiskProjectCount = parseInt(projHealthStats.at_risk_projects) || 0;
      const projectHealthRatio = activeProjectCount > 0 ? atRiskProjectCount / activeProjectCount : 0;

      const factors: { name: string; score: number; weight: number }[] = [];

      let overdueScore = 100;
      if (overdueRatio > 0.3) overdueScore = 25;
      else if (overdueRatio > 0.15) overdueScore = 55;
      else if (overdueRatio > 0) overdueScore = 80;
      factors.push({ name: 'Overdue Tasks', score: overdueScore, weight: 20 });

      let projHealthScore = 100;
      if (projectHealthRatio > 0.5) projHealthScore = 25;
      else if (projectHealthRatio > 0.25) projHealthScore = 55;
      else if (projectHealthRatio > 0) projHealthScore = 80;
      factors.push({ name: 'Project Health', score: projHealthScore, weight: 15 });

      let userActivityScore = 100;
      if (activeUserRatio < 0.3) userActivityScore = 30;
      else if (activeUserRatio < 0.5) userActivityScore = 55;
      else if (activeUserRatio < 0.7) userActivityScore = 75;
      factors.push({ name: 'User Activity', score: userActivityScore, weight: 15 });

      let completionScore = 60;
      if (taskCompletionRate > 0.5) completionScore = 100;
      else if (taskCompletionRate > 0.25) completionScore = 75;
      else if (taskCompletionRate < 0.1 && totalTasks > 5) completionScore = 30;
      factors.push({ name: 'Task Completion', score: completionScore, weight: 15 });

      let recencyScore = 100;
      if (recentActivity === 0) recencyScore = 20;
      else if (recentActivity < 3) recencyScore = 60;
      factors.push({ name: 'Activity Recency', score: recencyScore, weight: 15 });

      let integrityScore = 100;
      if (dataIntegrityCritical > 0) integrityScore = 30;
      else if (dataIntegrityWarning > 0) integrityScore = 70;
      factors.push({ name: 'Data Integrity', score: integrityScore, weight: 10 });

      let presenceScore = 100;
      if (totalProjects === 0 && totalTasks === 0) presenceScore = 20;
      else if (totalHours === 0 && totalTasks > 0) presenceScore = 60;
      factors.push({ name: 'Data Presence', score: presenceScore, weight: 10 });

      const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
      const healthScore = Math.max(0, Math.min(100,
        Math.round(factors.reduce((sum, f) => sum + (f.score * f.weight), 0) / totalWeight)
      ));

      let riskLevel: 'stable' | 'at_risk' | 'critical' = 'stable';
      if (healthScore < 40) riskLevel = 'critical';
      else if (healthScore < 70) riskLevel = 'at_risk';

      const health: HealthScore = {
        overall: healthScore,
        overdueTaskRatio: Math.round(overdueRatio * 100),
        projectCompletionRate: Math.round(projCompletionRate * 100),
        activeUserRatio: Math.round(activeUserRatio * 100),
        avgTasksPerUser: Math.round(avgTasksPerUser * 10) / 10,
        riskLevel,
        dataIntegrity: {
          isClean: dataIntegrityClean,
          issueCount: dataIntegrityIssueCount,
          criticalCount: dataIntegrityCritical,
          warningCount: dataIntegrityWarning,
        },
        factors,
      };

      const activity: ActivityMetrics = {
        totalUsers,
        activeUsers,
        totalProjects,
        activeProjects,
        totalTasks,
        completedTasks,
        overdueTasks,
        totalClients: parseInt(clientStats.total) || 0,
        totalTimeEntries: parseInt(timeStats.total_entries) || 0,
        recentTasksCreated7d: parseInt(recentStats.recent_tasks) || 0,
        recentTimeEntries7d: parseInt(recentStats.recent_time_entries) || 0,
      };

      const avgUsersPerTenant = parseFloat(benchStats.avg_users) || 0;
      const avgProjectsPerTenant = parseFloat(benchStats.avg_projects) || 0;
      const avgTasksPerTenant = parseFloat(benchStats.avg_tasks) || 0;
      const avgHoursPerTenant = parseFloat(benchStats.avg_hours) || 0;

      const avgCompletionRate = parseFloat(benchStats.avg_completion_rate) || 0;
      const avgOverdueRatio = parseFloat(benchStats.avg_overdue_ratio) || 0;

      const benchmark: PlatformBenchmark = {
        tenantRank: parseInt(benchStats.tenant_rank) || 0,
        totalTenants: parseInt(benchStats.tenant_count) || 0,
        avgUsersPerTenant,
        avgProjectsPerTenant,
        avgTasksPerTenant,
        avgHoursPerTenant,
        avgCompletionRate: Math.round(avgCompletionRate * 10) / 10,
        avgOverdueRatio: Math.round(avgOverdueRatio * 10) / 10,
        tenantUsersVsAvg: avgUsersPerTenant > 0 ? Math.round((totalUsers / avgUsersPerTenant) * 100) : 0,
        tenantProjectsVsAvg: avgProjectsPerTenant > 0 ? Math.round((totalProjects / avgProjectsPerTenant) * 100) : 0,
        tenantTasksVsAvg: avgTasksPerTenant > 0 ? Math.round((totalTasks / avgTasksPerTenant) * 100) : 0,
        tenantHoursVsAvg: avgHoursPerTenant > 0 ? Math.round((totalHours / avgHoursPerTenant) * 100) : 0,
      };

      const tenancyWarnings = tenantHealthResult
        ? tenantHealthResult.checks.map(c => ({
            checkName: c.checkName,
            severity: c.severity,
            count: c.count,
          }))
        : [];

      const adminActions: AdminActions = {
        recentNotes: noteRows.map(n => ({
          id: n.id,
          body: n.body,
          category: n.category,
          authorName: n.author_name,
          createdAt: n.created_at,
        })),
        recentAuditEvents: auditRows.map(a => ({
          id: a.id,
          eventType: a.event_type,
          message: a.message,
          actorName: a.actor_name,
          createdAt: a.created_at,
        })),
        riskAcknowledgments: riskAckRows.map(r => ({
          id: r.id,
          projectId: r.project_id,
          projectName: r.project_name,
          riskLevel: r.risk_level,
          acknowledgedByName: r.acknowledged_by_name,
          acknowledgedAt: r.acknowledged_at,
          mitigationNote: r.mitigation_note,
        })),
        tenancyWarnings,
      };

      const response: TenantIntelligenceResponse = {
        tenantId,
        tenantName: tenant.name,
        tenantStatus: tenant.status,
        financial,
        health,
        activity,
        benchmark,
        adminActions,
      };

      res.json(response);
    } catch (error) {
      console.error('[tenant-intelligence] Failed:', error);
      res.status(500).json({ error: 'Failed to get tenant intelligence data' });
    }
  }
);
