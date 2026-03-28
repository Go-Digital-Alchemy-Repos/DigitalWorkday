import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';

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
}

interface HealthScore {
  overall: number;
  overdueTaskRatio: number;
  projectCompletionRate: number;
  activeUserRatio: number;
  avgTasksPerUser: number;
  riskLevel: 'healthy' | 'warning' | 'critical';
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
  tenantUsersVsAvg: number;
  tenantProjectsVsAvg: number;
  tenantTasksVsAvg: number;
  tenantHoursVsAvg: number;
}

interface TenantIntelligenceResponse {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  financial: FinancialSummary;
  health: HealthScore;
  activity: ActivityMetrics;
  benchmark: PlatformBenchmark;
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
              CASE WHEN te.billing_status NOT IN ('non_billable')
                THEN te.duration_seconds ELSE 0 END
            ), 0)::text AS billable_seconds,
            COALESCE(SUM(
              CASE WHEN te.billing_status NOT IN ('non_billable')
                THEN (te.duration_seconds / 3600.0) * COALESCE(u.billable_rate::numeric, 0)
                ELSE 0
              END
            ), 0)::text AS estimated_revenue,
            COALESCE(SUM(
              (te.duration_seconds / 3600.0) * COALESCE(u.cost_rate::numeric, 0)
            ), 0)::text AS estimated_cost
          FROM time_entries te
          LEFT JOIN users u ON u.id = te.user_id
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
          tenant_rank: string;
        }>(sql`
          WITH tenant_stats AS (
            SELECT
              t.id AS tid,
              (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND role != 'super_user') AS user_count,
              (SELECT COUNT(*) FROM projects WHERE tenant_id = t.id) AS project_count,
              (SELECT COUNT(*) FROM tasks WHERE tenant_id = t.id) AS task_count,
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
            COALESCE((SELECT rnk::text FROM ranked WHERE tid = ${tenantId}), '0') AS tenant_rank
        `),
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
      const benchStats = benchmarkRows[0] || { tenant_count: '0', avg_users: '0', avg_projects: '0', avg_tasks: '0', avg_hours: '0', tenant_rank: '0' };

      const totalSeconds = parseFloat(timeStats.total_seconds) || 0;
      const billableSeconds = parseFloat(timeStats.billable_seconds) || 0;
      const nonBillableSeconds = totalSeconds - billableSeconds;
      const totalHours = totalSeconds / 3600;
      const billableHours = billableSeconds / 3600;
      const nonBillableHours = nonBillableSeconds / 3600;
      const estimatedRevenue = parseFloat(timeStats.estimated_revenue) || 0;
      const estimatedCost = parseFloat(timeStats.estimated_cost) || 0;
      const estimatedMargin = estimatedRevenue - estimatedCost;

      const financial: FinancialSummary = {
        totalHoursTracked: Math.round(totalHours * 10) / 10,
        billableHours: Math.round(billableHours * 10) / 10,
        nonBillableHours: Math.round(nonBillableHours * 10) / 10,
        billablePercent: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
        estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
        estimatedMargin: Math.round(estimatedMargin * 100) / 100,
        marginPercent: estimatedRevenue > 0 ? Math.round((estimatedMargin / estimatedRevenue) * 100) : 0,
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

      let healthScore = 100;
      if (overdueRatio > 0.3) healthScore -= 30;
      else if (overdueRatio > 0.15) healthScore -= 15;
      else if (overdueRatio > 0) healthScore -= 5;

      if (activeUserRatio < 0.5) healthScore -= 20;
      else if (activeUserRatio < 0.7) healthScore -= 10;

      if (totalProjects === 0 && totalTasks === 0) healthScore -= 20;
      if (totalHours === 0) healthScore -= 10;

      healthScore = Math.max(0, Math.min(100, healthScore));

      let riskLevel: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (healthScore < 40) riskLevel = 'critical';
      else if (healthScore < 70) riskLevel = 'warning';

      const health: HealthScore = {
        overall: healthScore,
        overdueTaskRatio: Math.round(overdueRatio * 100),
        projectCompletionRate: Math.round(projCompletionRate * 100),
        activeUserRatio: Math.round(activeUserRatio * 100),
        avgTasksPerUser: Math.round(avgTasksPerUser * 10) / 10,
        riskLevel,
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

      const benchmark: PlatformBenchmark = {
        tenantRank: parseInt(benchStats.tenant_rank) || 0,
        totalTenants: parseInt(benchStats.tenant_count) || 0,
        avgUsersPerTenant,
        avgProjectsPerTenant,
        avgTasksPerTenant,
        avgHoursPerTenant,
        tenantUsersVsAvg: avgUsersPerTenant > 0 ? Math.round((totalUsers / avgUsersPerTenant) * 100) : 0,
        tenantProjectsVsAvg: avgProjectsPerTenant > 0 ? Math.round((totalProjects / avgProjectsPerTenant) * 100) : 0,
        tenantTasksVsAvg: avgTasksPerTenant > 0 ? Math.round((totalTasks / avgTasksPerTenant) * 100) : 0,
        tenantHoursVsAvg: avgHoursPerTenant > 0 ? Math.round((totalHours / avgHoursPerTenant) * 100) : 0,
      };

      const response: TenantIntelligenceResponse = {
        tenantId,
        tenantName: tenant.name,
        tenantStatus: tenant.status,
        financial,
        health,
        activity,
        benchmark,
      };

      res.json(response);
    } catch (error) {
      console.error('[tenant-intelligence] Failed:', error);
      res.status(500).json({ error: 'Failed to get tenant intelligence data' });
    }
  }
);
