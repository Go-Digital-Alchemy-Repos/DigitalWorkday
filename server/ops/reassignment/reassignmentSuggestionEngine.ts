/**
 * @file server/ops/reassignment/reassignmentSuggestionEngine.ts
 * @description Capacity-aware workforce reassignment suggestion engine.
 *
 * Algorithm:
 * 1. Compute per-user estimated workload from active tasks in the date range
 * 2. Flag users as overloaded (≥100% capacity) or underutilized (≤70% capacity)
 * 3. Identify candidate tasks from overloaded users (non-urgent, reassignable)
 * 4. Score candidate (task, recipient) pairs by team match, role, proximity to due date, and priority
 * 5. Return top-N scored suggestions
 *
 * All suggestions are advisory only — no automatic changes are made.
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";

const log = createLogger("reassignment:engine");

export interface ReassignmentInput {
  tenantId: string;
  pmUserId?: string;
  projectId?: string;
  rangeStart: Date;
  rangeEnd: Date;
  limit: number;
  debugMode?: boolean;
}

export interface ReassignmentSuggestion {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  fromUserId: string;
  fromUserName: string;
  fromUtilizationPct: number;
  toUserId: string;
  toUserName: string;
  toUtilizationPct: number;
  score: number;
  reasons: string[];
  confidence: "low" | "medium" | "high";
  dueDate: string | null;
  priority: string;
}

export interface ReassignmentResult {
  suggestions: ReassignmentSuggestion[];
  meta: {
    overloadedUserCount: number;
    underutilizedUserCount: number;
    capacityMinutes: number;
    rangeDays: number;
  };
}

const OVERLOAD_THRESHOLD = 1.0;
const UNDERUTIL_THRESHOLD = 0.7;
const DUE_SOON_HOURS = 72;

export async function getReassignmentSuggestions(
  input: ReassignmentInput
): Promise<ReassignmentResult> {
  const { tenantId, pmUserId, projectId, rangeStart, rangeEnd, limit, debugMode } = input;

  const rangeDays = Math.max(
    1,
    Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24))
  );
  const capacityMinutes = rangeDays * 8 * 60;

  if (debugMode) {
    log.info("Engine params", { tenantId, rangeDays, capacityMinutes, projectId, pmUserId });
  }

  // --- 1. Load active team users and their team memberships ---
  const usersResult = await db.execute(sql`
    SELECT
      u.id,
      COALESCE(u.first_name || ' ' || u.last_name, u.name) AS full_name,
      u.role,
      COALESCE(
        (SELECT array_agg(tm.team_id) FROM team_members tm WHERE tm.user_id = u.id),
        '{}'::varchar[]
      ) AS team_ids
    FROM users u
    WHERE u.tenant_id = ${tenantId}
      AND u.is_active = true
      AND u.role IN ('admin', 'employee')
    ORDER BY u.id
  `);

  const users = (usersResult.rows as Array<{
    id: string;
    full_name: string;
    role: string;
    team_ids: string[];
  }>).filter(u => u.id);

  if (users.length < 2) {
    return { suggestions: [], meta: { overloadedUserCount: 0, underutilizedUserCount: 0, capacityMinutes, rangeDays } };
  }

  const userIds = users.map(u => u.id);
  const userMap = new Map(users.map(u => [u.id, u]));

  // --- 2. Compute workload per user (sum of estimate_minutes for active tasks) ---
  const workloadResult = await db.execute(sql`
    SELECT
      ta.user_id,
      COALESCE(SUM(t.estimate_minutes), 0)::int AS total_estimate_minutes,
      COUNT(t.id)::int AS active_task_count
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE ta.tenant_id = ${tenantId}
      AND t.tenant_id = ${tenantId}
      AND t.status IN ('todo', 'in_progress')
      AND (t.is_archived IS NULL OR t.is_archived = false)
      AND ta.user_id = ANY(${sql.raw(`ARRAY[${userIds.map(id => `'${id}'`).join(",")}]::varchar[]`)})
    GROUP BY ta.user_id
  `);

  const workloadMap = new Map<string, { estimateMinutes: number; taskCount: number }>();
  for (const row of workloadResult.rows as Array<{ user_id: string; total_estimate_minutes: number; active_task_count: number }>) {
    workloadMap.set(row.user_id, {
      estimateMinutes: row.total_estimate_minutes,
      taskCount: row.active_task_count,
    });
  }

  // Compute utilization per user
  const userUtilization = new Map<string, number>();
  for (const u of users) {
    const wl = workloadMap.get(u.id);
    const estimateMinutes = wl?.estimateMinutes ?? 0;
    const util = estimateMinutes / capacityMinutes;
    userUtilization.set(u.id, util);
  }

  const overloadedUsers = users.filter(u => (userUtilization.get(u.id) ?? 0) >= OVERLOAD_THRESHOLD);
  const underutilizedUsers = users.filter(u => (userUtilization.get(u.id) ?? 0) <= UNDERUTIL_THRESHOLD);

  if (debugMode) {
    log.info("Capacity analysis", {
      total: users.length,
      overloaded: overloadedUsers.map(u => ({ id: u.id, util: userUtilization.get(u.id) })),
      underutilized: underutilizedUsers.map(u => ({ id: u.id, util: userUtilization.get(u.id) })),
    });
  }

  if (overloadedUsers.length === 0 || underutilizedUsers.length === 0) {
    return {
      suggestions: [],
      meta: {
        overloadedUserCount: overloadedUsers.length,
        underutilizedUserCount: underutilizedUsers.length,
        capacityMinutes,
        rangeDays,
      },
    };
  }

  // --- 3. Load candidate tasks from overloaded users ---
  const overloadedUserIds = overloadedUsers.map(u => u.id);

  let taskQuery = sql`
    SELECT
      t.id AS task_id,
      t.title,
      t.status,
      t.priority,
      t.due_date,
      t.estimate_minutes,
      t.project_id,
      p.name AS project_name,
      ta.user_id AS assignee_id,
      (CASE
        WHEN t.due_date IS NOT NULL AND t.due_date <= NOW() + INTERVAL '72 hours' THEN true
        ELSE false
      END) AS due_soon
    FROM tasks t
    JOIN task_assignees ta ON ta.task_id = t.id
    JOIN projects p ON p.id = t.project_id
    WHERE t.tenant_id = ${tenantId}
      AND t.status IN ('todo', 'in_progress')
      AND (t.is_archived IS NULL OR t.is_archived = false)
      AND (t.is_private IS NULL OR t.is_private = false)
      AND ta.user_id = ANY(${sql.raw(`ARRAY[${overloadedUserIds.map(id => `'${id}'`).join(",")}]::varchar[]`)})
  `;

  if (projectId) {
    taskQuery = sql`${taskQuery} AND t.project_id = ${projectId}`;
  }

  if (pmUserId) {
    taskQuery = sql`${taskQuery}
      AND t.project_id IN (
        SELECT pm.project_id FROM project_members pm WHERE pm.user_id = ${pmUserId} AND pm.role = 'owner'
      )
    `;
  }

  taskQuery = sql`${taskQuery}
    ORDER BY
      due_soon ASC,
      CASE t.priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END ASC,
      t.estimate_minutes DESC NULLS LAST
    LIMIT 50
  `;

  const tasksResult = await db.execute(taskQuery);

  const candidateTasks = tasksResult.rows as Array<{
    task_id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    estimate_minutes: number | null;
    project_id: string;
    project_name: string;
    assignee_id: string;
    due_soon: boolean;
  }>;

  if (candidateTasks.length === 0) {
    return {
      suggestions: [],
      meta: {
        overloadedUserCount: overloadedUsers.length,
        underutilizedUserCount: underutilizedUsers.length,
        capacityMinutes,
        rangeDays,
      },
    };
  }

  // --- 4. Score (task, recipient) pairs ---
  const now = new Date();
  const dueSoonMs = DUE_SOON_HOURS * 60 * 60 * 1000;
  const scored: Array<ReassignmentSuggestion> = [];
  const seen = new Set<string>();

  for (const task of candidateTasks) {
    const fromUser = userMap.get(task.assignee_id);
    if (!fromUser) continue;

    const fromUtil = userUtilization.get(fromUser.id) ?? 0;

    for (const recipient of underutilizedUsers) {
      if (recipient.id === fromUser.id) continue;
      const pairKey = `${task.task_id}:${recipient.id}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const toUtil = userUtilization.get(recipient.id) ?? 0;
      let score = 30;
      const reasons: string[] = [];

      reasons.push("Assignee over capacity");

      if (toUtil <= 0.3) {
        reasons.push("Recipient significantly underutilized");
        score += 15;
      } else {
        reasons.push("Recipient underutilized");
        score += 10;
      }

      const sameTeam = fromUser.team_ids.some(tid => recipient.team_ids.includes(tid));
      if (sameTeam) {
        reasons.push("Same team");
        score += 20;
      }

      if (fromUser.role === recipient.role) {
        score += 5;
      }

      if (task.due_date) {
        const dueDateMs = new Date(task.due_date).getTime() - now.getTime();
        if (dueDateMs < dueSoonMs && dueDateMs > 0) {
          reasons.push("Due soon — reassign carefully");
          score -= 15;
        } else if (dueDateMs <= 0) {
          reasons.push("Overdue");
          score -= 25;
        }
      }

      if (task.priority === "urgent") {
        reasons.push("Urgent — reassign carefully");
        score -= 10;
      } else if (task.priority === "high") {
        score -= 5;
      }

      const confidence: "low" | "medium" | "high" =
        score >= 50 ? "high" : score >= 35 ? "medium" : "low";

      scored.push({
        taskId: task.task_id,
        taskTitle: task.title,
        projectId: task.project_id,
        projectName: task.project_name,
        fromUserId: fromUser.id,
        fromUserName: fromUser.full_name,
        fromUtilizationPct: Math.round(fromUtil * 100),
        toUserId: recipient.id,
        toUserName: recipient.full_name,
        toUtilizationPct: Math.round(toUtil * 100),
        score,
        reasons,
        confidence,
        dueDate: task.due_date ? new Date(task.due_date).toISOString() : null,
        priority: task.priority,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const deduped: ReassignmentSuggestion[] = [];
  const usedTaskIds = new Set<string>();
  const usedRecipients = new Map<string, number>();

  for (const s of scored) {
    if (deduped.length >= limit) break;
    if (usedTaskIds.has(s.taskId)) continue;
    const recipientUsage = usedRecipients.get(s.toUserId) ?? 0;
    if (recipientUsage >= 2) continue;

    usedTaskIds.add(s.taskId);
    usedRecipients.set(s.toUserId, recipientUsage + 1);
    deduped.push(s);
  }

  return {
    suggestions: deduped,
    meta: {
      overloadedUserCount: overloadedUsers.length,
      underutilizedUserCount: underutilizedUsers.length,
      capacityMinutes,
      rangeDays,
    },
  };
}
