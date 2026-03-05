/**
 * @file server/ops/statusReports/statusReportGenerator.ts
 * @description Weekly Project Status Report Generator
 *
 * Builds a structured weekly status report from live project data.
 * Respects private visibility, excludes archived items, and limits list sizes.
 *
 * Sections produced:
 * 1. Summary (project metadata + health snapshot)
 * 2. Completed tasks this period
 * 3. Upcoming deadlines (next 7 days from range_end)
 * 4. Overdue tasks
 * 5. Milestone progress (if milestones feature enabled)
 * 6. Risk flags + drivers
 * 7. Burn / budget summary
 * 8. Time tracked this period
 * 9. Capacity concerns (overloaded users)
 */

import { db } from "../../db";
import { projectStatusReports } from "@shared/schema";
import { sql } from "drizzle-orm";
import { config } from "../../config";
import { getProjectRiskState } from "../risk/riskAckService";

const MAX_LIST = 15;

export interface StatusReportSection {
  title: string;
  type: "summary" | "task_list" | "metric" | "risk" | "progress" | "capacity";
  items?: StatusReportItem[];
  metrics?: Record<string, string | number | null>;
  body?: string;
}

export interface StatusReportItem {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  assigneeName?: string | null;
  completedAt?: string | null;
}

export interface GeneratedStatusReport {
  reportId: string;
  projectId: string;
  projectName: string;
  rangeStart: string;
  rangeEnd: string;
  sections: StatusReportSection[];
  summaryMarkdown: string;
  generatedAt: string;
}

export async function generateWeeklyStatusReport(params: {
  tenantId: string;
  projectId: string;
  rangeStart: string;
  rangeEnd: string;
  viewerUserId: string;
}): Promise<GeneratedStatusReport> {
  const { tenantId, projectId, rangeStart, rangeEnd, viewerUserId } = params;

  const rangeStartDate = new Date(rangeStart);
  const rangeEndDate = new Date(rangeEnd);
  const nextWeek = new Date(rangeEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  // --- Private visibility filter ---
  // Viewer sees tasks they created or have access to (plus non-private tasks)
  const privateVisFilter = config.features.enablePrivateTasks
    ? sql`AND (t.visibility != 'private' OR t.created_by = ${viewerUserId} OR EXISTS (
        SELECT 1 FROM task_access ta WHERE ta.task_id = t.id AND ta.user_id = ${viewerUserId} AND ta.tenant_id = ${tenantId}
      ))`
    : sql``;

  // --- Fetch all data in parallel ---
  const [
    projectRow,
    completedTasks,
    upcomingTasks,
    overdueTasks,
    milestoneRows,
    burnRow,
    timeRow,
    capacityRows,
    projectMembers,
  ] = await Promise.all([
    // 1. Project info
    db.execute(sql`
      SELECT p.id, p.name, p.status, p.budget_minutes, p.color, c.company_name AS client_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = ${projectId} AND p.tenant_id = ${tenantId}
      LIMIT 1
    `),

    // 2. Completed tasks in range
    db.execute(sql`
      SELECT t.id, t.title, t.status, t.priority, t.due_date, t.updated_at AS completed_at,
        COALESCE(u.first_name || ' ' || u.last_name, u.email, 'Unassigned') AS assignee_name
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN users u ON u.id = ta.user_id
      WHERE t.project_id = ${projectId}
        AND t.tenant_id = ${tenantId}
        AND t.status IN ('done', 'completed')
        AND t.updated_at >= ${rangeStart}::timestamp
        AND t.updated_at <= ${rangeEnd}::timestamp
        AND t.archived_at IS NULL
        ${privateVisFilter}
      ORDER BY t.updated_at DESC
      LIMIT ${MAX_LIST}
    `),

    // 3. Upcoming deadlines (due within next 7 days from range end)
    db.execute(sql`
      SELECT t.id, t.title, t.status, t.priority, t.due_date,
        COALESCE(u.first_name || ' ' || u.last_name, u.email, 'Unassigned') AS assignee_name
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN users u ON u.id = ta.user_id
      WHERE t.project_id = ${projectId}
        AND t.tenant_id = ${tenantId}
        AND t.status NOT IN ('done', 'completed', 'cancelled')
        AND t.due_date > ${rangeEnd}::date
        AND t.due_date <= ${nextWeekStr}::date
        AND t.archived_at IS NULL
        ${privateVisFilter}
      ORDER BY t.due_date ASC
      LIMIT ${MAX_LIST}
    `),

    // 4. Overdue tasks (due before range_end, not done)
    db.execute(sql`
      SELECT t.id, t.title, t.status, t.priority, t.due_date,
        COALESCE(u.first_name || ' ' || u.last_name, u.email, 'Unassigned') AS assignee_name
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN users u ON u.id = ta.user_id
      WHERE t.project_id = ${projectId}
        AND t.tenant_id = ${tenantId}
        AND t.status NOT IN ('done', 'completed', 'cancelled')
        AND t.due_date < ${rangeEnd}::date
        AND t.archived_at IS NULL
        ${privateVisFilter}
      ORDER BY t.due_date ASC
      LIMIT ${MAX_LIST}
    `),

    // 5. Milestones (if feature enabled)
    config.features.enableProjectMilestones
      ? db.execute(sql`
          SELECT id, name, description, due_date, status,
            (SELECT COUNT(*)::int FROM tasks WHERE milestone_id = project_milestones.id AND status IN ('done','completed')) AS completed_tasks,
            (SELECT COUNT(*)::int FROM tasks WHERE milestone_id = project_milestones.id) AS total_tasks
          FROM project_milestones
          WHERE project_id = ${projectId} AND tenant_id = ${tenantId}
          ORDER BY due_date ASC NULLS LAST
          LIMIT 10
        `)
      : Promise.resolve({ rows: [] }),

    // 6. Burn / budget summary
    db.execute(sql`
      SELECT COALESCE(SUM(duration_seconds) / 60, 0)::int AS total_minutes
      FROM time_entries
      WHERE project_id = ${projectId} AND tenant_id = ${tenantId}
    `),

    // 7. Time tracked in range
    db.execute(sql`
      SELECT COALESCE(SUM(duration_seconds) / 60, 0)::int AS period_minutes
      FROM time_entries
      WHERE project_id = ${projectId}
        AND tenant_id = ${tenantId}
        AND start_time >= ${rangeStart}::timestamp
        AND start_time <= ${rangeEnd}::timestamp
    `),

    // 8. Capacity concerns (users with >80% utilization)
    db.execute(sql`
      SELECT
        u.id,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) AS name,
        COUNT(t.id)::int AS active_tasks
      FROM task_assignees ta
      JOIN tasks t ON t.id = ta.task_id
      JOIN users u ON u.id = ta.user_id
      WHERE t.project_id = ${projectId}
        AND t.tenant_id = ${tenantId}
        AND t.status NOT IN ('done', 'completed', 'cancelled')
        AND t.archived_at IS NULL
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY active_tasks DESC
      LIMIT 10
    `),

    // 9. Project member count
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS member_count
      FROM project_members
      WHERE project_id = ${projectId} AND tenant_id = ${tenantId}
    `),
  ]);

  const project = projectRow.rows[0] as {
    id: string;
    name: string;
    status: string;
    budget_minutes: number | null;
    color: string | null;
    client_name: string | null;
  } | undefined;

  if (!project) throw new Error("Project not found");

  const riskState = await getProjectRiskState(tenantId, projectId);

  const completed = completedTasks.rows as any[];
  const upcoming = upcomingTasks.rows as any[];
  const overdue = overdueTasks.rows as any[];
  const milestones = milestoneRows.rows as any[];
  const totalBurnMinutes = (burnRow.rows[0] as any)?.total_minutes ?? 0;
  const periodMinutes = (timeRow.rows[0] as any)?.period_minutes ?? 0;
  const capacity = capacityRows.rows as any[];
  const memberCount = (projectMembers.rows[0] as any)?.member_count ?? 0;

  const budgetHours = project.budget_minutes ? project.budget_minutes / 60 : null;
  const burnHours = totalBurnMinutes / 60;
  const burnPct = budgetHours ? Math.round((burnHours / budgetHours) * 100) : null;
  const periodHours = Math.round((periodMinutes / 60) * 10) / 10;

  // Compute milestone completion
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m: any) => m.status === "completed").length;
  const overdueMilestones = milestones.filter(
    (m: any) => m.due_date && new Date(m.due_date) < rangeEndDate && m.status !== "completed"
  ).length;

  // --- Build sections ---
  const sections: StatusReportSection[] = [];

  // Section 1: Summary
  sections.push({
    title: "Project Overview",
    type: "summary",
    metrics: {
      "Project": project.name,
      "Client": project.client_name ?? "—",
      "Status": project.status,
      "Report Period": `${rangeStart} to ${rangeEnd}`,
      "Team Size": memberCount,
      "Health Score": riskState.riskScore,
      "Risk Level": riskState.riskLevel === "stable" ? "Stable" : riskState.riskLevel === "at_risk" ? "At Risk" : "Critical",
    },
  });

  // Section 2: Completed tasks
  sections.push({
    title: `Completed This Period (${completed.length})`,
    type: "task_list",
    items: completed.map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
      assigneeName: t.assignee_name,
      completedAt: t.completed_at,
    })),
    metrics: { count: completed.length },
  });

  // Section 3: Upcoming deadlines
  sections.push({
    title: `Upcoming Deadlines — Next 7 Days (${upcoming.length})`,
    type: "task_list",
    items: upcoming.map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
      assigneeName: t.assignee_name,
    })),
    metrics: { count: upcoming.length },
  });

  // Section 4: Overdue tasks
  if (overdue.length > 0) {
    sections.push({
      title: `Overdue Tasks (${overdue.length})`,
      type: "task_list",
      items: overdue.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
        assigneeName: t.assignee_name,
      })),
      metrics: { count: overdue.length },
    });
  }

  // Section 5: Milestones
  if (config.features.enableProjectMilestones && milestones.length > 0) {
    sections.push({
      title: "Milestone Progress",
      type: "progress",
      metrics: {
        total: totalMilestones,
        completed: completedMilestones,
        overdue: overdueMilestones,
        completionPct: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
      },
      items: milestones.map((m: any) => ({
        id: m.id,
        title: m.name,
        status: m.status,
        dueDate: m.due_date,
        assigneeName: `${m.completed_tasks}/${m.total_tasks} tasks`,
      })),
    });
  }

  // Section 6: Risk flags
  sections.push({
    title: "Risk Summary",
    type: "risk",
    metrics: {
      level: riskState.riskLevel === "stable" ? "Stable" : riskState.riskLevel === "at_risk" ? "At Risk" : "Critical",
      score: riskState.riskScore,
      overdueCount: riskState.overdueCount,
      burnPercent: riskState.burnPercent ?? "N/A",
    },
    body: riskState.drivers.length > 0
      ? `Risk drivers: ${riskState.drivers.join(", ")}`
      : "No active risk drivers.",
  });

  // Section 7: Burn / budget
  sections.push({
    title: "Budget & Burn",
    type: "metric",
    metrics: {
      "Hours Tracked (Period)": `${periodHours}h`,
      "Total Hours Logged": `${Math.round(burnHours * 10) / 10}h`,
      "Budget": budgetHours ? `${Math.round(budgetHours)}h` : "Not set",
      "Burn Rate": burnPct !== null ? `${burnPct}%` : "N/A",
      "Status": burnPct !== null && burnPct >= 80 ? "⚠ Over 80% consumed" : burnPct !== null ? "On track" : "No budget set",
    },
  });

  // Section 8: Capacity concerns
  if (capacity.length > 0) {
    const overloaded = capacity.filter((u: any) => u.active_tasks >= 5);
    sections.push({
      title: "Capacity Overview",
      type: "capacity",
      metrics: {
        teamSize: memberCount,
        overloadedCount: overloaded.length,
      },
      items: capacity.map((u: any) => ({
        id: u.id,
        title: u.name,
        assigneeName: `${u.active_tasks} active tasks`,
        status: u.active_tasks >= 5 ? "overloaded" : u.active_tasks >= 3 ? "busy" : "available",
      })),
    });
  }

  // --- Build markdown ---
  const summaryMarkdown = buildMarkdown(project.name, rangeStart, rangeEnd, sections);

  // --- Persist to DB ---
  const [saved] = await db
    .insert(projectStatusReports)
    .values({
      tenantId,
      projectId,
      rangeStart,
      rangeEnd,
      generatedByUserId: viewerUserId,
      summaryMarkdown,
      sectionsJson: sections as any,
      isSent: false,
    })
    .returning({ id: projectStatusReports.id, createdAt: projectStatusReports.createdAt });

  return {
    reportId: saved.id,
    projectId,
    projectName: project.name,
    rangeStart,
    rangeEnd,
    sections,
    summaryMarkdown,
    generatedAt: saved.createdAt.toISOString(),
  };
}

function buildMarkdown(
  projectName: string,
  rangeStart: string,
  rangeEnd: string,
  sections: StatusReportSection[]
): string {
  const lines: string[] = [
    `# Weekly Status Report: ${projectName}`,
    `**Period:** ${rangeStart} to ${rangeEnd}`,
    `**Generated:** ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    "",
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`, "");

    if (section.metrics) {
      for (const [key, value] of Object.entries(section.metrics)) {
        if (value !== null && value !== undefined) {
          lines.push(`- **${key}:** ${value}`);
        }
      }
    }

    if (section.body) {
      lines.push("", section.body);
    }

    if (section.items && section.items.length > 0) {
      lines.push("");
      for (const item of section.items) {
        const parts = [`- ${item.title}`];
        if (item.assigneeName) parts.push(`(${item.assigneeName})`);
        if (item.dueDate) parts.push(`— due ${item.dueDate}`);
        if (item.priority && item.priority !== "medium") parts.push(`[${item.priority}]`);
        lines.push(parts.join(" "));
      }
    } else if (section.type === "task_list" && (!section.items || section.items.length === 0)) {
      lines.push("", "_No items_");
    }

    lines.push("");
  }

  return lines.join("\n");
}
