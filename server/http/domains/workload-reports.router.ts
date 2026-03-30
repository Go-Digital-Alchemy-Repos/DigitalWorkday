import { Router, Request } from "express";
import { createApiRouter } from "../routerFactory";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { UserRole } from "@shared/schema";
import { AppError, handleRouteError } from "../../lib/errors";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

function isAdmin(req: Request): boolean {
  const role = (req.user as any)?.role;
  return role === UserRole.ADMIN || role === UserRole.SUPER_USER || role === UserRole.TENANT_OWNER;
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

function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

interface TaskRow {
  [key: string]: unknown;
  id: string;
  tenant_id: string | null;
  project_id: string | null;
  section_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  is_personal: boolean;
  visibility: string;
  created_by: string | null;
  order_index: number;
  personal_section_id: string | null;
  personal_sort_order: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_reason: string | null;
  needs_pm_review: boolean;
  pm_review_requested_at: string | null;
  pm_review_requested_by: string | null;
  pm_review_resolved_at: string | null;
  pm_review_resolved_by: string | null;
  pm_review_note: string | null;
  is_billable: boolean;
  project_name: string | null;
}

interface HydratedRelations {
  assignees: Record<string, unknown[]>;
  watchers: Record<string, unknown[]>;
  tags: Record<string, unknown[]>;
  subtasks: Record<string, unknown[]>;
  childTasks: Record<string, unknown[]>;
  sections: Record<string, Record<string, unknown> | null>;
  projects: Record<string, Record<string, unknown> | null>;
}

async function batchHydrateRelations(taskIds: string[], tenantId: string | null): Promise<HydratedRelations> {
  if (taskIds.length === 0) {
    return { assignees: {}, watchers: {}, tags: {}, subtasks: {}, childTasks: {}, sections: {}, projects: {} };
  }

  const idList = sql.join(taskIds.map(id => sql`${id}`), sql`, `);

  const [assigneeRows, watcherRows, tagRows, subtaskRows, childTaskRows, sectionRows, projectRows] = await Promise.all([
    dbRows<{ task_id: string; [key: string]: unknown }>(sql`
      SELECT ta.*, u.id AS user_id, u.first_name AS user_first_name, u.last_name AS user_last_name,
             u.email AS user_email, u.name AS user_name, u.avatar_url AS user_avatar_url, u.role AS user_role
      FROM task_assignees ta
      LEFT JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id IN (${idList}) AND ta.tenant_id = ${tenantId}
    `),
    dbRows<{ task_id: string; [key: string]: unknown }>(sql`
      SELECT tw.*, u.id AS user_id, u.first_name AS user_first_name, u.last_name AS user_last_name,
             u.email AS user_email, u.name AS user_name, u.avatar_url AS user_avatar_url, u.role AS user_role
      FROM task_watchers tw
      LEFT JOIN users u ON u.id = tw.user_id
      WHERE tw.task_id IN (${idList}) AND tw.tenant_id = ${tenantId}
    `),
    dbRows<{ task_id: string; [key: string]: unknown }>(sql`
      SELECT tt.*, t.id AS tag_id, t.name AS tag_name, t.color AS tag_color
      FROM task_tags tt
      LEFT JOIN tags t ON t.id = tt.tag_id
      WHERE tt.task_id IN (${idList})
    `),
    dbRows<{ task_id: string; [key: string]: unknown }>(sql`
      SELECT * FROM subtasks WHERE task_id IN (${idList})
      ORDER BY order_index ASC
    `),
    dbRows<{ parent_task_id: string; [key: string]: unknown }>(sql`
      SELECT * FROM tasks WHERE parent_task_id IN (${idList}) AND tenant_id = ${tenantId}
    `),
    dbRows<{ id: string; [key: string]: unknown }>(sql`
      SELECT DISTINCT s.* FROM sections s
      JOIN tasks t ON t.section_id = s.id
      WHERE t.id IN (${idList}) AND t.section_id IS NOT NULL
    `),
    dbRows<{ id: string; [key: string]: unknown }>(sql`
      SELECT DISTINCT p.* FROM projects p
      JOIN tasks t ON t.project_id = p.id
      WHERE t.id IN (${idList}) AND t.project_id IS NOT NULL AND p.tenant_id = ${tenantId}
    `),
  ]);

  const result: HydratedRelations = {
    assignees: {}, watchers: {}, tags: {}, subtasks: {}, childTasks: {},
    sections: {}, projects: {},
  };

  for (const row of assigneeRows) {
    const tid = row.task_id;
    if (!result.assignees[tid]) result.assignees[tid] = [];
    const userObj = row.user_id ? camelizeRow({
      id: row.user_id, firstName: row.user_first_name, lastName: row.user_last_name,
      email: row.user_email, name: row.user_name, avatarUrl: row.user_avatar_url, role: row.user_role,
    }) : undefined;
    result.assignees[tid].push({ ...camelizeRow(row), user: userObj });
  }

  for (const row of watcherRows) {
    const tid = row.task_id;
    if (!result.watchers[tid]) result.watchers[tid] = [];
    const userObj = row.user_id ? camelizeRow({
      id: row.user_id, firstName: row.user_first_name, lastName: row.user_last_name,
      email: row.user_email, name: row.user_name, avatarUrl: row.user_avatar_url, role: row.user_role,
    }) : undefined;
    result.watchers[tid].push({ ...camelizeRow(row), user: userObj });
  }

  for (const row of tagRows) {
    const tid = row.task_id;
    if (!result.tags[tid]) result.tags[tid] = [];
    const tagObj = row.tag_id ? { id: row.tag_id, name: row.tag_name, color: row.tag_color } : undefined;
    result.tags[tid].push({ ...camelizeRow(row), tag: tagObj });
  }

  for (const row of subtaskRows) {
    const tid = row.task_id;
    if (!result.subtasks[tid]) result.subtasks[tid] = [];
    result.subtasks[tid].push(camelizeRow(row));
  }

  for (const row of childTaskRows) {
    const tid = row.parent_task_id;
    if (!result.childTasks[tid]) result.childTasks[tid] = [];
    result.childTasks[tid].push(camelizeRow(row));
  }

  const sectionMap = new Map<string, Record<string, unknown>>();
  for (const row of sectionRows) {
    sectionMap.set(row.id, camelizeRow(row));
  }

  const projectMap = new Map<string, Record<string, unknown>>();
  for (const row of projectRows) {
    projectMap.set(row.id, camelizeRow(row));
  }

  return { ...result, sections: Object.fromEntries(sectionMap), projects: Object.fromEntries(projectMap) };
}

function applyRelations(
  task: Record<string, unknown>,
  relations: HydratedRelations
): Record<string, unknown> {
  const id = task.id as string;
  const sectionId = task.sectionId as string | null;
  const projectId = task.projectId as string | null;
  const result: Record<string, unknown> = {
    ...task,
    assignees: relations.assignees[id] ?? [],
    watchers: relations.watchers[id] ?? [],
    tags: relations.tags[id] ?? [],
    subtasks: relations.subtasks[id] ?? [],
    childTasks: relations.childTasks[id] ?? [],
  };
  if (sectionId && relations.sections[sectionId]) {
    result.section = relations.sections[sectionId];
  }
  if (projectId && relations.projects[projectId]) {
    result.project = relations.projects[projectId];
  }
  return result;
}

interface EmployeeWorkload {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  next7DaysTasks: number;
  highPriorityTasks: number;
  completionRate: number;
}

router.get("/workload/tasks-by-employee", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const rows = await dbRows<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      avatar_url: string | null;
      total_tasks: string;
      open_tasks: string;
      completed_tasks: string;
      overdue_tasks: string;
      due_today_tasks: string;
      next_7_days_tasks: string;
      high_priority_tasks: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url,
        COUNT(DISTINCT t.id)::int AS total_tasks,
        COUNT(DISTINCT CASE WHEN t.status != 'done' THEN t.id END)::int AS open_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END)::int AS completed_tasks,
        COUNT(DISTINCT CASE
          WHEN t.status != 'done'
            AND t.due_date IS NOT NULL
            AND t.due_date::date < CURRENT_DATE
          THEN t.id
        END)::int AS overdue_tasks,
        COUNT(DISTINCT CASE
          WHEN t.status != 'done'
            AND t.due_date IS NOT NULL
            AND t.due_date::date = CURRENT_DATE
          THEN t.id
        END)::int AS due_today_tasks,
        COUNT(DISTINCT CASE
          WHEN t.status != 'done'
            AND t.due_date IS NOT NULL
            AND t.due_date::date > CURRENT_DATE
            AND t.due_date::date <= CURRENT_DATE + 7
          THEN t.id
        END)::int AS next_7_days_tasks,
        COUNT(DISTINCT CASE
          WHEN t.status != 'done'
            AND t.priority IN ('high', 'urgent')
          THEN t.id
        END)::int AS high_priority_tasks
      FROM users u
      LEFT JOIN LATERAL (
        SELECT id, status, due_date, priority
        FROM tasks
        WHERE tenant_id = ${tenantId}
          AND archived_at IS NULL
          AND (
            id IN (SELECT task_id FROM task_assignees WHERE user_id = u.id AND tenant_id = ${tenantId})
            OR (is_personal = true AND created_by = u.id)
          )
      ) t ON true
      WHERE u.tenant_id = ${tenantId}
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.avatar_url
      HAVING COUNT(DISTINCT t.id) > 0
      ORDER BY COUNT(DISTINCT CASE WHEN t.status != 'done' THEN t.id END) DESC
    `);

    const workloadData: EmployeeWorkload[] = rows.map((r) => {
      const totalTasks = Number(r.total_tasks);
      let openTasks = Number(r.open_tasks);
      let completedTasks = Number(r.completed_tasks);

      let overdueTasks = Number(r.overdue_tasks);
      let dueTodayTasks = Number(r.due_today_tasks);
      let next7DaysTasks = Number(r.next_7_days_tasks);
      let highPriorityTasks = Number(r.high_priority_tasks);

      if (status === "open") {
        completedTasks = 0;
      } else if (status === "completed") {
        openTasks = 0;
        overdueTasks = 0;
        dueTodayTasks = 0;
        next7DaysTasks = 0;
        highPriorityTasks = 0;
      }

      return {
        userId: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        avatarUrl: r.avatar_url,
        totalTasks,
        openTasks,
        completedTasks,
        overdueTasks,
        dueTodayTasks,
        next7DaysTasks,
        highPriorityTasks,
        completionRate: totalTasks > 0
          ? Math.round((completedTasks / totalTasks) * 100)
          : 0,
      };
    });

    return res.json(workloadData);
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/tasks-by-employee", req);
  }
});

router.get("/workload/employee/:userId/tasks", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const { userId } = req.params;
    const filter = typeof req.query.filter === "string" ? req.query.filter : undefined;

    const userRow = firstRow(await dbRows<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      avatar_url: string | null;
    }>(sql`
      SELECT id, first_name, last_name, email, avatar_url
      FROM users WHERE id = ${userId} AND tenant_id = ${tenantId} LIMIT 1
    `));

    if (!userRow) {
      throw AppError.notFound("User");
    }

    let filterCondition = sql``;
    if (filter === "overdue") {
      filterCondition = sql`AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date::date < CURRENT_DATE`;
    } else if (filter === "today") {
      filterCondition = sql`AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date::date = CURRENT_DATE`;
    } else if (filter === "next7days") {
      filterCondition = sql`AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date::date > CURRENT_DATE AND t.due_date::date <= CURRENT_DATE + 7`;
    } else if (filter === "open") {
      filterCondition = sql`AND t.status != 'done'`;
    }

    const taskRows = await dbRows<TaskRow>(sql`
      SELECT
        t.*,
        p.name AS project_name
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
      WHERE t.tenant_id = ${tenantId}
        AND t.archived_at IS NULL
        AND (
          t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ${userId} AND tenant_id = ${tenantId})
          OR (t.is_personal = true AND t.created_by = ${userId})
        )
        ${filterCondition}
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    `);

    const taskIds = taskRows.map((r) => r.id);
    const relations = await batchHydrateRelations(taskIds, tenantId);

    const tasks = taskRows.map((row) => {
      const camelized = camelizeRow(row);
      camelized.projectName = row.project_name;
      return applyRelations(camelized, relations);
    });

    return res.json({
      user: {
        id: userRow.id,
        firstName: userRow.first_name,
        lastName: userRow.last_name,
        email: userRow.email,
        avatarUrl: userRow.avatar_url,
      },
      tasks,
      totalCount: tasks.length,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/employee/:userId/tasks", req);
  }
});

router.get("/workload/unassigned", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);

    const taskRows = await dbRows<TaskRow>(sql`
      SELECT
        t.*,
        p.name AS project_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
      WHERE t.tenant_id = ${tenantId}
        AND t.status != 'done'
        AND t.is_personal = false
        AND t.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId}
        )
      ORDER BY t.due_date ASC NULLS LAST
    `);

    const taskIds = taskRows.map((r) => r.id);
    const relations = await batchHydrateRelations(taskIds, tenantId);

    const tasks = taskRows.map((row) => {
      const camelized = camelizeRow(row);
      camelized.projectName = row.project_name;
      return applyRelations(camelized, relations);
    });

    return res.json({
      tasks,
      totalCount: tasks.length,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/unassigned", req);
  }
});

router.get("/workload/by-status", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);

    const rows = await dbRows<{
      status: string;
      count: string;
    }>(sql`
      SELECT
        COALESCE(t.status, 'todo') AS status,
        COUNT(*)::int AS count
      FROM tasks t
      JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
      WHERE t.tenant_id = ${tenantId}
        AND t.is_personal = false
        AND t.archived_at IS NULL
      GROUP BY t.status
    `);

    const statusCounts: Record<string, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
    };

    for (const row of rows) {
      const s = row.status || "todo";
      statusCounts[s] = (statusCounts[s] || 0) + Number(row.count);
    }

    return res.json({
      summary: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
      })),
      total: Object.values(statusCounts).reduce((sum, c) => sum + c, 0),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/by-status", req);
  }
});

router.get("/workload/by-priority", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);

    const rows = await dbRows<{
      priority: string;
      count: string;
    }>(sql`
      SELECT
        COALESCE(t.priority, 'none') AS priority,
        COUNT(*)::int AS count
      FROM tasks t
      JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
      WHERE t.tenant_id = ${tenantId}
        AND t.status != 'done'
        AND t.is_personal = false
        AND t.archived_at IS NULL
      GROUP BY t.priority
    `);

    const priorityCounts: Record<string, number> = {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0,
    };

    for (const row of rows) {
      const p = row.priority || "none";
      priorityCounts[p] = (priorityCounts[p] || 0) + Number(row.count);
    }

    return res.json({
      summary: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
      })),
      total: Object.values(priorityCounts).reduce((sum, c) => sum + c, 0),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/by-priority", req);
  }
});

router.get("/workload/summary", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);

    const [taskRows, countRows] = await Promise.all([
      dbRows<{
        total_open: string;
        total_completed: string;
        total_overdue: string;
      }>(sql`
        SELECT
          COUNT(CASE WHEN t.status != 'done' THEN 1 END)::int AS total_open,
          COUNT(CASE WHEN t.status = 'done' THEN 1 END)::int AS total_completed,
          COUNT(CASE
            WHEN t.status != 'done'
              AND t.due_date IS NOT NULL
              AND t.due_date::date < CURRENT_DATE
            THEN 1
          END)::int AS total_overdue
        FROM tasks t
        JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
        WHERE t.tenant_id = ${tenantId}
          AND t.is_personal = false
          AND t.archived_at IS NULL
      `),
      dbRows<{
        total_employees: string;
        total_projects: string;
      }>(sql`
        SELECT
          (SELECT COUNT(*)::int FROM users WHERE tenant_id = ${tenantId}) AS total_employees,
          (SELECT COUNT(*)::int FROM projects WHERE tenant_id = ${tenantId}) AS total_projects
      `),
    ]);

    const taskRow = firstRow(taskRows);
    const countRow = firstRow(countRows);

    const totalOpenTasks = Number(taskRow?.total_open ?? 0);
    const totalCompletedTasks = Number(taskRow?.total_completed ?? 0);
    const totalOverdueTasks = Number(taskRow?.total_overdue ?? 0);
    const totalEmployees = Number(countRow?.total_employees ?? 0);
    const totalProjects = Number(countRow?.total_projects ?? 0);

    return res.json({
      totalEmployees,
      totalProjects,
      totalOpenTasks,
      totalCompletedTasks,
      totalOverdueTasks,
      avgTasksPerEmployee: totalEmployees > 0
        ? Math.round((totalOpenTasks + totalCompletedTasks) / totalEmployees)
        : 0,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/summary", req);
  }
});

export default router;
