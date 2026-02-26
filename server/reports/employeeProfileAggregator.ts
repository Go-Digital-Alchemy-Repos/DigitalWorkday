import { db } from "../db";
import { sql } from "drizzle-orm";
import { formatMinutesToHours } from "./utils";
import { calculateEmployeePerformance } from "./performance/calculateEmployeePerformance";

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

export interface EmployeeProfileParams {
  tenantId: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
}

export async function getEmployeeProfileReport({
  tenantId,
  employeeId,
  startDate,
  endDate,
}: EmployeeProfileParams) {
  const daysInRange = Math.max(
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    1
  );

  // 1. Employee Info
  const employeeInfoPromise = db.execute<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    role: string;
    avatar_url: string | null;
    is_active: boolean;
    team_name: string | null;
  }>(sql`
    SELECT 
      u.id, 
      u.first_name, 
      u.last_name, 
      u.email, 
      u.role, 
      u.avatar_url, 
      u.is_active,
      t.name as team_name
    FROM users u
    LEFT JOIN team_members tm ON tm.user_id = u.id
    LEFT JOIN teams t ON t.id = tm.team_id AND t.tenant_id = ${tenantId}
    WHERE u.id = ${employeeId} AND u.tenant_id = ${tenantId}
    LIMIT 1
  `);

  // 2. Workload & Summary Stats
  const workloadStatsPromise = db.execute<{
    active_tasks: string;
    overdue_tasks: string;
    due_soon: string;
    backlog: string;
    completed_in_range: string;
    avg_completion_days: string | null;
  }>(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN t.status NOT IN ('done', 'cancelled') THEN t.id END) AS active_tasks,
      COUNT(DISTINCT CASE WHEN t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW() THEN t.id END) AS overdue_tasks,
      COUNT(DISTINCT CASE 
        WHEN t.status NOT IN ('done', 'cancelled') 
        AND t.due_date > NOW() 
        AND t.due_date <= NOW() + INTERVAL '7 days' 
        THEN t.id 
      END) AS due_soon,
      COUNT(DISTINCT CASE 
        WHEN t.status NOT IN ('done', 'cancelled') 
        AND t.updated_at < NOW() - INTERVAL '14 days' 
        THEN t.id 
      END) AS backlog,
      COUNT(DISTINCT CASE 
        WHEN t.status = 'done' 
        AND t.updated_at >= ${startDate} 
        AND t.updated_at <= ${endDate} 
        THEN t.id 
      END) AS completed_in_range,
      AVG(CASE 
        WHEN t.status = 'done' 
        AND t.updated_at >= ${startDate} 
        AND t.updated_at <= ${endDate} 
        THEN EXTRACT(days FROM (t.updated_at - t.created_at)) 
      END) AS avg_completion_days
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
    WHERE ta.user_id = ${employeeId} AND ta.tenant_id = ${tenantId}
      AND t.archived_at IS NULL
  `);

  // 3. Time Tracking Stats
  const timeTrackingPromise = db.execute<{
    total_seconds: string;
    billable_seconds: string;
    logged_days: string;
    estimated_minutes: string;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate} THEN te.duration_seconds ELSE 0 END), 0) AS total_seconds,
      0 AS billable_seconds, -- placeholder if billable not in schema
      COUNT(DISTINCT CASE WHEN te.start_time >= ${startDate} AND te.start_time <= ${endDate} THEN DATE(te.start_time) END) AS logged_days,
      COALESCE((
        SELECT SUM(COALESCE(t2.estimate_minutes, 0))
        FROM task_assignees ta2
        JOIN tasks t2 ON t2.id = ta2.task_id AND t2.tenant_id = ${tenantId}
        WHERE ta2.user_id = ${employeeId} AND ta2.tenant_id = ${tenantId}
          AND t2.status NOT IN ('done', 'cancelled')
          AND t2.archived_at IS NULL
      ), 0) AS estimated_minutes
    FROM time_entries te
    WHERE te.user_id = ${employeeId} AND te.tenant_id = ${tenantId}
  `);

  // 4. Capacity Stats (Last 8 weeks)
  const capacityPromise = db.execute<{
    week_start: string;
    planned_minutes: string;
    actual_seconds: string;
  }>(sql`
    SELECT
      date_trunc('week', gs.week)::date AS week_start,
      COALESCE(SUM(CASE
        WHEN t.due_date >= gs.week AND t.due_date < gs.week + INTERVAL '7 days'
          AND t.status NOT IN ('done', 'cancelled')
        THEN COALESCE(t.estimate_minutes, 0) ELSE 0
      END), 0) AS planned_minutes,
      COALESCE(SUM(CASE
        WHEN te.start_time >= gs.week AND te.start_time < gs.week + INTERVAL '7 days'
        THEN te.duration_seconds ELSE 0
      END), 0) AS actual_seconds
    FROM generate_series(
      date_trunc('week', ${startDate}::timestamp),
      date_trunc('week', ${endDate}::timestamp),
      '1 week'::interval
    ) AS gs(week)
    LEFT JOIN task_assignees ta ON ta.user_id = ${employeeId} AND ta.tenant_id = ${tenantId}
    LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId} AND t.archived_at IS NULL
    LEFT JOIN time_entries te ON te.user_id = ${employeeId} AND te.tenant_id = ${tenantId}
    GROUP BY gs.week
    ORDER BY gs.week
  `);

  // 5. Task Breakdown
  const breakdownStatusPromise = db.execute<{ status: string; count: string }>(sql`
    SELECT t.status, COUNT(*) as count
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
    WHERE ta.user_id = ${employeeId} AND ta.tenant_id = ${tenantId}
      AND t.archived_at IS NULL
    GROUP BY t.status
  `);

  const breakdownPriorityPromise = db.execute<{ priority: string; count: string }>(sql`
    SELECT t.priority, COUNT(*) as count
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
    WHERE ta.user_id = ${employeeId} AND ta.tenant_id = ${tenantId}
      AND t.archived_at IS NULL
    GROUP BY t.priority
  `);

  const breakdownProjectPromise = db.execute<{ project_id: string; project_name: string; count: string }>(sql`
    SELECT p.id as project_id, p.name as project_name, COUNT(*) as count
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
    JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
    WHERE ta.user_id = ${employeeId} AND ta.tenant_id = ${tenantId}
      AND t.archived_at IS NULL
    GROUP BY p.id, p.name
    ORDER BY count DESC
    LIMIT 10
  `);

  // 6. Assigned Tasks (open only — excludes done/cancelled/archived)
  const assignedTasksPromise = db.execute<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    project_id: string | null;
    project_name: string | null;
    estimate_minutes: string | null;
    created_at: string;
    updated_at: string;
  }>(sql`
    SELECT
      t.id,
      t.title,
      t.status,
      t.priority,
      t.due_date,
      t.project_id,
      p.name as project_name,
      t.estimate_minutes,
      t.created_at,
      t.updated_at
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${tenantId}
    LEFT JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
    WHERE ta.user_id = ${employeeId} AND ta.tenant_id = ${tenantId}
      AND t.archived_at IS NULL
      AND t.status NOT IN ('done', 'cancelled')
    ORDER BY
      CASE WHEN t.due_date IS NOT NULL AND t.due_date < NOW() THEN 0 ELSE 1 END,
      t.due_date ASC NULLS LAST,
      t.updated_at DESC
    LIMIT 100
  `);

  // 7. Performance Index (EPI)
  const performancePromise = calculateEmployeePerformance({
    tenantId,
    startDate,
    endDate,
    userId: employeeId,
  });

  // Wait for all
  const [
    employeeInfoResult,
    workloadResult,
    timeTrackingResult,
    capacityResult,
    breakdownStatus,
    breakdownPriority,
    breakdownProject,
    assignedTasksResult,
    performance,
  ] = await Promise.all([
    employeeInfoPromise,
    workloadStatsPromise,
    timeTrackingPromise,
    capacityPromise,
    breakdownStatusPromise,
    breakdownPriorityPromise,
    breakdownProjectPromise,
    assignedTasksPromise,
    performancePromise,
  ]);

  const employeeRows = toRows<typeof employeeInfoResult extends (infer U)[] ? U : any>(employeeInfoResult);
  const employee = employeeRows[0];
  if (!employee) return null;

  const workloadRows = toRows<any>(workloadResult);
  const workload = workloadRows[0];
  const timeRows = toRows<any>(timeTrackingResult);
  const time = timeRows[0];
  const capacityRows = toRows<any>(capacityResult);
  const statusRows = toRows<any>(breakdownStatus);
  const priorityRows = toRows<any>(breakdownPriority);
  const projectRows = toRows<any>(breakdownProject);
  const taskRows = toRows<any>(assignedTasksResult);
  const perf = performance.results[0];

  const totalHours = Math.round(Number(time.total_seconds) / 3600 * 10) / 10;
  const billableHours = Math.round(Number(time.billable_seconds) / 3600 * 10) / 10;
  const estimatedHours = formatMinutesToHours(Number(time.estimated_minutes));
  const loggedDays = Number(time.logged_days);
  const avgHoursPerDay = loggedDays > 0 ? Math.round((totalHours / loggedDays) * 10) / 10 : 0;

  const activeTasks = Number(workload.active_tasks);
  const completedInRange = Number(workload.completed_in_range);
  const completionDenom = completedInRange + activeTasks;
  const completionRate = completionDenom > 0 ? Math.round((completedInRange / completionDenom) * 100) : 0;
  const overdueCount = Number(workload.overdue_tasks);
  const overdueRate = activeTasks > 0 ? Math.round((overdueCount / activeTasks) * 100) : 0;

  const weeklyData = capacityRows.map(r => {
    const actHours = Math.round(Number(r.actual_seconds) / 3600 * 10) / 10;
    const planHours = Math.round(Number(r.planned_minutes) / 60 * 10) / 10;
    return {
      week: r.week_start,
      plannedHours: planHours,
      actualHours: actHours,
      utilization: Math.round((actHours / 40) * 100),
      overAllocated: actHours > 40,
    };
  });

  const riskIndicators = perf?.riskFlags.map(flag => ({
    type: "Performance",
    severity: flag.includes("High") || flag.includes("Overutil") ? "high" : "medium",
    description: flag,
  })) || [];

  if (overdueCount > 5) {
    riskIndicators.push({ type: "Workload", severity: "high", description: `User has ${overdueCount} overdue tasks.` });
  }

  return {
    employee: {
      id: employee.id,
      name: `${employee.first_name || ""} ${employee.last_name || ""}`.trim(),
      role: employee.role,
      team: employee.team_name,
      avatarUrl: employee.avatar_url,
      status: employee.is_active ? "active" : "inactive",
    },
    summary: {
      performanceScore: perf?.overallScore || 0,
      performanceTier: perf?.performanceTier || "Stable",
      riskLevel: riskIndicators.length > 2 ? "Critical" : riskIndicators.length > 0 ? "At Risk" : "Healthy",
      utilization: perf?.rawMetrics.utilizationPct || 0,
      capacityUsage: Math.round((totalHours / (daysInRange * 8)) * 100),
      completionRate,
      overdueRate,
    },
    workload: {
      activeTasks,
      completedInRange,
      overdueTasks: overdueCount,
      dueSoon: Number(workload.due_soon),
      backlog: Number(workload.backlog),
      avgCompletionDays: workload.avg_completion_days ? Math.round(Number(workload.avg_completion_days) * 10) / 10 : null,
    },
    timeTracking: {
      totalHours,
      billableHours,
      nonBillableHours: Math.round((totalHours - billableHours) * 10) / 10,
      avgHoursPerDay,
      estimatedHours,
      variance: Math.round((totalHours - estimatedHours) * 10) / 10,
    },
    capacity: {
      weeklyData,
    },
    riskIndicators,
    taskBreakdown: {
      byStatus: statusRows.map(r => ({ label: r.status, value: Number(r.count) })),
      byPriority: priorityRows.map(r => ({ label: r.priority, value: Number(r.count) })),
      byProject: projectRows.map(r => ({ label: r.project_name, value: Number(r.count) })),
    },
    trend: {
      weeklyCompletion: capacityRows.map(r => ({ week: r.week_start, count: 0 })),
      weeklyTimeTracked: capacityRows.map(r => ({ week: r.week_start, hours: Math.round(Number(r.actual_seconds) / 3600 * 10) / 10 })),
    },
    assignedTasks: taskRows.map((r: any) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date,
      projectId: r.project_id,
      projectName: r.project_name,
      estimateMinutes: r.estimate_minutes ? Number(r.estimate_minutes) : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
}
