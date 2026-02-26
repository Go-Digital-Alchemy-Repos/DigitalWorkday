import { db } from "../db";
import { sql } from "drizzle-orm";
import { calculateClientHealth } from "./health/calculateClientHealth";

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

export interface ClientProfileParams {
  tenantId: string;
  clientId: string;
  startDate: Date;
  endDate: Date;
}

export async function getClientProfileReport({
  tenantId,
  clientId,
  startDate,
  endDate,
}: ClientProfileParams) {
  const clientInfoPromise = db.execute<{
    id: string;
    company_name: string;
    primary_contact_name: string | null;
    primary_contact_email: string | null;
    phone: string | null;
    status: string | null;
    industry: string | null;
    website: string | null;
    created_at: string;
  }>(sql`
    SELECT
      c.id,
      c.company_name,
      c.primary_contact_name,
      c.primary_contact_email,
      c.phone,
      c.status,
      c.industry,
      c.website,
      c.created_at
    FROM clients c
    WHERE c.id = ${clientId} AND c.tenant_id = ${tenantId}
    LIMIT 1
  `);

  const overviewPromise = db.execute<{
    active_projects: string;
    open_tasks: string;
    overdue_tasks: string;
    completed_in_range: string;
    total_seconds: string;
    last_activity_date: string | null;
  }>(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS active_projects,
      COUNT(DISTINCT CASE WHEN t.status NOT IN ('done', 'cancelled') THEN t.id END) AS open_tasks,
      COUNT(DISTINCT CASE WHEN t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_tasks,
      COUNT(DISTINCT CASE WHEN t.status = 'done' AND t.updated_at BETWEEN ${startDate} AND ${endDate} THEN t.id END) AS completed_in_range,
      COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0) AS total_seconds,
      GREATEST(MAX(t.updated_at), MAX(te.start_time)) AS last_activity_date
    FROM clients c
    LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
    WHERE c.id = ${clientId} AND c.tenant_id = ${tenantId}
  `);

  const activityPromise = db.execute<{
    tasks_created_in_range: string;
    comments_in_range: string;
    time_logged_in_range: string;
  }>(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN t.created_at BETWEEN ${startDate} AND ${endDate} THEN t.id END) AS tasks_created_in_range,
      COUNT(DISTINCT CASE WHEN cm.created_at BETWEEN ${startDate} AND ${endDate} THEN cm.id END) AS comments_in_range,
      COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0)::float / 3600.0 AS time_logged_in_range
    FROM clients c
    LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
    LEFT JOIN comments cm ON cm.task_id = t.id
    WHERE c.id = ${clientId} AND c.tenant_id = ${tenantId}
  `);

  const timePromise = db.execute<{
    total_seconds: string;
    billable_seconds: string;
    estimated_minutes: string;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0) AS total_seconds,
      0 AS billable_seconds,
      COALESCE(SUM(CASE WHEN t.status NOT IN ('done','cancelled') THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END), 0) AS estimated_minutes
    FROM clients c
    LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
    WHERE c.id = ${clientId} AND c.tenant_id = ${tenantId}
  `);

  const slaPromise = db.execute<{
    total_tasks: string;
    overdue_count: string;
    completed_on_time: string;
    total_done_with_due: string;
  }>(sql`
    SELECT
      COUNT(DISTINCT t.id) AS total_tasks,
      COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_count,
      COUNT(DISTINCT CASE WHEN t.status = 'done' AND t.due_date IS NOT NULL AND t.updated_at <= t.due_date THEN t.id END) AS completed_on_time,
      COUNT(DISTINCT CASE WHEN t.status = 'done' AND t.due_date IS NOT NULL THEN t.id END) AS total_done_with_due
    FROM clients c
    LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    WHERE c.id = ${clientId} AND c.tenant_id = ${tenantId}
  `);

  const taskAgingPromise = db.execute<{
    aging_under7: string;
    aging_7_14: string;
    aging_14_30: string;
    aging_over30: string;
  }>(sql`
    SELECT
      COUNT(DISTINCT CASE
        WHEN t.status NOT IN ('done','cancelled') AND EXTRACT(days FROM NOW() - t.created_at) < 7
        THEN t.id END) AS aging_under7,
      COUNT(DISTINCT CASE
        WHEN t.status NOT IN ('done','cancelled')
          AND EXTRACT(days FROM NOW() - t.created_at) >= 7
          AND EXTRACT(days FROM NOW() - t.created_at) < 14
        THEN t.id END) AS aging_7_14,
      COUNT(DISTINCT CASE
        WHEN t.status NOT IN ('done','cancelled')
          AND EXTRACT(days FROM NOW() - t.created_at) >= 14
          AND EXTRACT(days FROM NOW() - t.created_at) < 30
        THEN t.id END) AS aging_14_30,
      COUNT(DISTINCT CASE
        WHEN t.status NOT IN ('done','cancelled') AND EXTRACT(days FROM NOW() - t.created_at) >= 30
        THEN t.id END) AS aging_over30
    FROM clients c
    LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    WHERE c.id = ${clientId} AND c.tenant_id = ${tenantId}
  `);

  const breakdownStatusPromise = db.execute<{ status: string; count: string }>(sql`
    SELECT t.status, COUNT(*) as count
    FROM projects p
    JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
    WHERE p.client_id = ${clientId} AND p.tenant_id = ${tenantId}
      AND t.archived_at IS NULL
    GROUP BY t.status
  `);

  const breakdownPriorityPromise = db.execute<{ priority: string; count: string }>(sql`
    SELECT t.priority, COUNT(*) as count
    FROM projects p
    JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
    WHERE p.client_id = ${clientId} AND p.tenant_id = ${tenantId}
      AND t.archived_at IS NULL
    GROUP BY t.priority
  `);

  const topProjectsPromise = db.execute<{
    project_id: string;
    project_name: string;
    project_status: string;
    task_count: string;
    hours: string;
  }>(sql`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.status AS project_status,
      COUNT(DISTINCT t.id) AS task_count,
      COALESCE(SUM(CASE WHEN te.start_time BETWEEN ${startDate} AND ${endDate} THEN te.duration_seconds ELSE 0 END), 0)::float / 3600.0 AS hours
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    LEFT JOIN time_entries te ON te.project_id = p.id AND te.tenant_id = ${tenantId}
    WHERE p.client_id = ${clientId} AND p.tenant_id = ${tenantId}
    GROUP BY p.id, p.name, p.status
    ORDER BY task_count DESC
    LIMIT 10
  `);

  const healthPromise = calculateClientHealth({
    tenantId,
    startDate,
    endDate,
    clientId,
    limit: 1,
    offset: 0,
  });

  const [
    clientInfoResult,
    overviewResult,
    activityResult,
    timeResult,
    slaResult,
    taskAgingResult,
    breakdownStatus,
    breakdownPriority,
    topProjectsResult,
    healthResult,
  ] = await Promise.all([
    clientInfoPromise,
    overviewPromise,
    activityPromise,
    timePromise,
    slaPromise,
    taskAgingPromise,
    breakdownStatusPromise,
    breakdownPriorityPromise,
    topProjectsPromise,
    healthPromise,
  ]);

  const clientRows = toRows<any>(clientInfoResult);
  const client = clientRows[0];
  if (!client) return null;

  const overview = toRows<any>(overviewResult)[0];
  const activity = toRows<any>(activityResult)[0];
  const time = toRows<any>(timeResult)[0];
  const sla = toRows<any>(slaResult)[0];
  const taskAging = toRows<any>(taskAgingResult)[0];
  const statusRows = toRows<any>(breakdownStatus);
  const priorityRows = toRows<any>(breakdownPriority);
  const projectRows = toRows<any>(topProjectsResult);
  const health = healthResult.results[0];

  const totalHours = Math.round(Number(time.total_seconds) / 3600 * 10) / 10;
  const billableHours = Math.round(Number(time.billable_seconds) / 3600 * 10) / 10;
  const estimatedHours = Math.round(Number(time.estimated_minutes) / 60 * 10) / 10;

  const openTasks = Number(overview.open_tasks);
  const overdueTasks = Number(overview.overdue_tasks);
  const completedInRange = Number(overview.completed_in_range);
  const totalTasks = Number(sla.total_tasks);
  const overdueRate = openTasks > 0 ? Math.round((overdueTasks / openTasks) * 100) : 0;
  const completionDenom = completedInRange + openTasks;
  const completionRate = completionDenom > 0 ? Math.round((completedInRange / completionDenom) * 100) : 0;

  const totalDoneWithDue = Number(sla.total_done_with_due);
  const completedOnTime = Number(sla.completed_on_time);
  const slaComplianceRate = totalDoneWithDue > 0 ? Math.round((completedOnTime / totalDoneWithDue) * 100) : 0;
  const overdueTaskPct = totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100 * 10) / 10 : 0;

  const totalHoursInRange = Math.round(Number(activity.time_logged_in_range) * 10) / 10;

  const engagementScore = Math.min(
    100,
    Math.round(
      Math.min(totalHours, 40) / 40 * 40 +
      Math.min(openTasks, 20) / 20 * 40 +
      Math.min(completedInRange, 10) / 10 * 20
    )
  );

  const lastActivityDate = overview.last_activity_date
    ? new Date(overview.last_activity_date)
    : null;
  const inactivityDays = lastActivityDate
    ? Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const riskIndicators: Array<{ type: string; severity: "high" | "medium" | "low"; description: string }> = [];

  if (health?.riskFlags) {
    for (const flag of health.riskFlags) {
      riskIndicators.push({
        type: "Health",
        severity: flag.includes("High") || flag.includes(">30%") || flag.includes("significantly") ? "high" : "medium",
        description: flag,
      });
    }
  }

  if (overdueTasks > 5 && !riskIndicators.some(r => r.description.includes("overdue"))) {
    riskIndicators.push({ type: "Workload", severity: "high", description: `Client has ${overdueTasks} overdue tasks.` });
  }

  if (inactivityDays !== null && inactivityDays > 21 && !riskIndicators.some(r => r.description.includes("activity"))) {
    riskIndicators.push({ type: "Engagement", severity: "medium", description: `No activity in ${inactivityDays} days.` });
  }

  return {
    client: {
      id: client.id,
      companyName: client.company_name,
      contactName: client.primary_contact_name,
      contactEmail: client.primary_contact_email,
      phone: client.phone,
      status: client.status || "active",
      industry: client.industry,
      website: client.website,
      createdAt: client.created_at,
    },
    summary: {
      healthScore: health?.overallScore ?? 0,
      healthTier: health?.healthTier ?? "Monitor",
      riskLevel: riskIndicators.length > 2 ? "Critical" : riskIndicators.length > 0 ? "At Risk" : "Healthy",
      completionRate,
      overdueRate,
      slaComplianceRate,
      engagementScore,
      totalHours,
    },
    overview: {
      activeProjects: Number(overview.active_projects),
      openTasks,
      overdueTasks,
      completedInRange,
      totalHours,
      lastActivityDate: overview.last_activity_date,
      inactivityDays,
    },
    activity: {
      tasksCreatedInRange: Number(activity.tasks_created_in_range),
      commentsInRange: Number(activity.comments_in_range),
      timeLoggedInRange: totalHoursInRange,
    },
    timeTracking: {
      totalHours,
      billableHours,
      nonBillableHours: Math.round((totalHours - billableHours) * 10) / 10,
      estimatedHours,
      variance: Math.round((totalHours - estimatedHours) * 10) / 10,
    },
    sla: {
      totalTasks,
      overdueCount: overdueTasks,
      overdueTaskPct,
      completedOnTime,
      totalDoneWithDue,
      slaComplianceRate,
    },
    taskAging: {
      agingUnder7: Number(taskAging.aging_under7),
      aging7to14: Number(taskAging.aging_7_14),
      aging14to30: Number(taskAging.aging_14_30),
      agingOver30: Number(taskAging.aging_over30),
    },
    healthIndex: health ? {
      overallScore: health.overallScore,
      healthTier: health.healthTier,
      componentScores: health.componentScores,
    } : null,
    riskIndicators,
    taskBreakdown: {
      byStatus: statusRows.map((r: any) => ({ label: r.status, value: Number(r.count) })),
      byPriority: priorityRows.map((r: any) => ({ label: r.priority, value: Number(r.count) })),
    },
    topProjects: projectRows.map((r: any) => ({
      projectId: r.project_id,
      projectName: r.project_name,
      projectStatus: r.project_status,
      taskCount: Number(r.task_count),
      hours: Math.round(Number(r.hours) * 10) / 10,
    })),
  };
}
