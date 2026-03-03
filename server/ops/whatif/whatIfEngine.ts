/**
 * @file server/ops/whatif/whatIfEngine.ts
 * @description Capacity What-If Simulation Engine
 *
 * Applies proposed changes (reassign, move due date, adjust estimate) to an
 * in-memory snapshot of the current project state and computes before/after metrics.
 *
 * SAFETY: No DB writes occur in this module. All changes are applied in-memory only.
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import type {
  WhatIfInput,
  WhatIfOutput,
  WhatIfStateSnapshot,
  UserUtilization,
  ProjectRisk,
  BurnSnapshot,
  UtilizationShift,
} from "./types";

const log = createLogger("whatif:engine");

interface TaskRow {
  id: string;
  title: string;
  estimateMinutes: number;
  dueDate: string | null;
  status: string;
  priority: string;
  assignees: string[];
}

interface UserRow {
  id: string;
  name: string;
  totalEstimateMinutes: number;
}

interface ProjectRow {
  id: string;
  name: string;
  budgetMinutes: number | null;
  status: string;
}

interface BurnRow {
  burnMinutes: number;
  startedAt: string | null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function computeWhatIfScenario(input: WhatIfInput): Promise<WhatIfOutput> {
  const {
    tenantId,
    projectId,
    rangeStart: rangeStartStr,
    rangeEnd: rangeEndStr,
    changes,
  } = input;

  const rangeStart = new Date(rangeStartStr);
  const rangeEnd = new Date(rangeEndStr);
  const rangeDays = Math.max(
    1,
    Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24))
  );
  const capacityMinutesPerUser = rangeDays * 8 * 60;

  log.info("[whatif] Starting simulation", { projectId, rangeDays });

  const [projectRows, taskRows, userWorkloadRows, burnRows] = await Promise.all([
    fetchProjectData(tenantId, projectId),
    fetchProjectTasks(tenantId, projectId, rangeStart, rangeEnd),
    fetchUserWorkloads(tenantId, rangeStart, rangeEnd),
    fetchBurnData(tenantId, projectId),
  ]);

  if (projectRows.length === 0) {
    throw new Error(`Project ${projectId} not found`);
  }

  const project = projectRows[0];
  const now = new Date();

  // Build a mutable in-memory copy of tasks
  let tasks: TaskRow[] = taskRows.map((t) => ({ ...t, assignees: [...t.assignees] }));
  const userMap = new Map<string, UserRow>(userWorkloadRows.map((u) => [u.id, { ...u }]));

  // -------------------------------------------------------------------
  // Compute BEFORE state
  // -------------------------------------------------------------------
  const before = computeState(tasks, userMap, capacityMinutesPerUser, project, burnRows, now);

  // -------------------------------------------------------------------
  // Apply changes in-memory (no DB writes!)
  // -------------------------------------------------------------------
  let reassignmentsApplied = 0;
  let dueDateMovesApplied = 0;
  let estimateAdjustmentsApplied = 0;

  if (changes.reassign) {
    for (const r of changes.reassign) {
      const task = tasks.find((t) => t.id === r.taskId);
      if (!task) continue;
      const oldAssignees = task.assignees;
      const oldPrimary = oldAssignees[0];
      if (!oldPrimary || oldPrimary === r.toUserId) continue;

      // Shift estimate minutes from old -> new user in workload map
      const oldUser = userMap.get(oldPrimary);
      const newUser = userMap.get(r.toUserId);
      const estimateToShift = task.estimateMinutes;

      if (oldUser) {
        oldUser.totalEstimateMinutes = Math.max(0, oldUser.totalEstimateMinutes - estimateToShift);
      }
      if (newUser) {
        newUser.totalEstimateMinutes += estimateToShift;
      } else if (r.toUserId) {
        userMap.set(r.toUserId, {
          id: r.toUserId,
          name: r.toUserId,
          totalEstimateMinutes: estimateToShift,
        });
      }

      task.assignees = [r.toUserId, ...oldAssignees.filter((a) => a !== oldPrimary && a !== r.toUserId)];
      reassignmentsApplied++;
    }
  }

  if (changes.moveDueDate) {
    for (const d of changes.moveDueDate) {
      const task = tasks.find((t) => t.id === d.taskId);
      if (!task) continue;
      task.dueDate = d.newDueDate;
      dueDateMovesApplied++;
    }
  }

  if (changes.adjustEstimateHours) {
    for (const e of changes.adjustEstimateHours) {
      const task = tasks.find((t) => t.id === e.taskId);
      if (!task) continue;
      const oldEstimate = task.estimateMinutes;
      const newEstimate = Math.round(e.newEstimateHours * 60);
      const delta = newEstimate - oldEstimate;

      // Shift estimate in user workloads
      for (const assigneeId of task.assignees) {
        const user = userMap.get(assigneeId);
        if (user) {
          user.totalEstimateMinutes = Math.max(0, user.totalEstimateMinutes + delta);
        }
      }

      task.estimateMinutes = newEstimate;
      estimateAdjustmentsApplied++;
    }
  }

  // -------------------------------------------------------------------
  // Compute AFTER state
  // -------------------------------------------------------------------
  const after = computeState(tasks, userMap, capacityMinutesPerUser, project, burnRows, now);

  // -------------------------------------------------------------------
  // Compute deltas
  // -------------------------------------------------------------------
  const beforeUtilMap = new Map(before.utilizationByUser.map((u) => [u.userId, u]));
  const afterUtilMap = new Map(after.utilizationByUser.map((u) => [u.userId, u]));

  const allUserIds = new Set([...beforeUtilMap.keys(), ...afterUtilMap.keys()]);
  const utilizationShift: UtilizationShift[] = [];

  for (const userId of allUserIds) {
    const b = beforeUtilMap.get(userId);
    const a = afterUtilMap.get(userId);
    if (!b && !a) continue;
    const beforePct = b?.utilizationPct ?? 0;
    const afterPct = a?.utilizationPct ?? 0;
    if (Math.abs(afterPct - beforePct) < 0.5) continue; // skip negligible changes
    utilizationShift.push({
      userId,
      userName: b?.userName ?? a?.userName ?? userId,
      deltaUtilizationPct: Math.round((afterPct - beforePct) * 10) / 10,
      before: beforePct,
      after: afterPct,
    });
  }

  utilizationShift.sort((a, b) => Math.abs(b.deltaUtilizationPct) - Math.abs(a.deltaUtilizationPct));

  const burnDelta =
    before.burn && after.burn
      ? { projectedFinalHoursDelta: Math.round((after.burn.projectedFinalHours - before.burn.projectedFinalHours) * 10) / 10 }
      : null;

  log.info("[whatif] Simulation complete", {
    projectId,
    reassignmentsApplied,
    dueDateMovesApplied,
    estimateAdjustmentsApplied,
    riskBefore: before.projectRisk.level,
    riskAfter: after.projectRisk.level,
  });

  return {
    projectId,
    projectName: project.name,
    rangeStart: rangeStartStr,
    rangeEnd: rangeEndStr,
    before,
    after,
    delta: {
      utilizationShift,
      riskDelta: { from: before.projectRisk.level, to: after.projectRisk.level },
      burnDelta,
    },
    appliedChanges: {
      reassignments: reassignmentsApplied,
      dueDateMoves: dueDateMovesApplied,
      estimateAdjustments: estimateAdjustmentsApplied,
    },
  };
}

// ---------------------------------------------------------------------------
// State computation (pure, no IO)
// ---------------------------------------------------------------------------

function computeState(
  tasks: TaskRow[],
  userMap: Map<string, UserRow>,
  capacityMinutesPerUser: number,
  project: ProjectRow,
  burnRows: BurnRow[],
  now: Date
): WhatIfStateSnapshot {
  const utilizationByUser = computeUtilization(tasks, userMap, capacityMinutesPerUser);
  const projectRisk = computeProjectRisk(tasks, project, burnRows, now);
  const burn = computeBurn(project, burnRows, tasks, now);

  return { utilizationByUser, projectRisk, burn };
}

function computeUtilization(
  tasks: TaskRow[],
  userMap: Map<string, UserRow>,
  capacityMinutes: number
): UserUtilization[] {
  const result: UserUtilization[] = [];
  const seen = new Set<string>();

  for (const user of userMap.values()) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);

    const hoursPlanned = Math.round((user.totalEstimateMinutes / 60) * 10) / 10;
    const utilizationPct = Math.round((user.totalEstimateMinutes / capacityMinutes) * 1000) / 10;

    result.push({
      userId: user.id,
      userName: user.name,
      utilizationPct,
      hoursPlanned,
    });
  }

  // Add any assignees that appear in project tasks but not in userMap
  const projectAssignees = new Set(tasks.flatMap((t) => t.assignees));
  for (const uid of projectAssignees) {
    if (!seen.has(uid)) {
      seen.add(uid);
      result.push({ userId: uid, userName: uid, utilizationPct: 0, hoursPlanned: 0 });
    }
  }

  return result.sort((a, b) => b.utilizationPct - a.utilizationPct);
}

function computeProjectRisk(
  tasks: TaskRow[],
  project: ProjectRow,
  burnRows: BurnRow[],
  now: Date
): ProjectRisk {
  const drivers: string[] = [];
  let score = 100;

  const overdueTasks = tasks.filter(
    (t) =>
      t.dueDate &&
      new Date(t.dueDate) < now &&
      !["done", "completed"].includes(t.status)
  );

  const overdueCount = overdueTasks.length;
  if (overdueCount > 0) {
    const penalty = Math.min(40, overdueCount * 10);
    score -= penalty;
    drivers.push(`${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}`);
  }

  const burnPct = computeBurnPct(project, burnRows);
  if (burnPct !== null && burnPct >= 80) {
    score -= 20;
    drivers.push(`Budget ${burnPct}% consumed`);
  }

  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  if (blockedTasks.length > 0) {
    score -= Math.min(15, blockedTasks.length * 5);
    drivers.push(`${blockedTasks.length} blocked task${blockedTasks.length !== 1 ? "s" : ""}`);
  }

  let level: ProjectRisk["level"] = "stable";
  if (score < 40 || (overdueCount >= 3 && burnPct !== null && burnPct >= 80)) {
    level = "critical";
  } else if (score < 70 || overdueCount > 0 || (burnPct !== null && burnPct >= 80)) {
    level = "at_risk";
  }

  if (drivers.length === 0) drivers.push("No issues detected");

  return { level, drivers };
}

function computeBurnPct(project: ProjectRow, burnRows: BurnRow[]): number | null {
  if (!project.budgetMinutes || project.budgetMinutes === 0 || burnRows.length === 0) return null;
  const burnMinutes = burnRows[0]?.burnMinutes ?? 0;
  return Math.round((burnMinutes / project.budgetMinutes) * 100);
}

function computeBurn(
  project: ProjectRow,
  burnRows: BurnRow[],
  tasks: TaskRow[],
  now: Date
): BurnSnapshot | null {
  if (!project.budgetMinutes || project.budgetMinutes === 0) return null;

  const burnMinutes = burnRows[0]?.burnMinutes ?? 0;
  const budgetHours = Math.round((project.budgetMinutes / 60) * 10) / 10;
  const loggedHours = Math.round((burnMinutes / 60) * 10) / 10;
  const percentConsumed = Math.round((burnMinutes / project.budgetMinutes) * 100);

  // Remaining estimated work from current tasks
  const remainingEstimateMinutes = tasks
    .filter((t) => !["done", "completed"].includes(t.status))
    .reduce((sum, t) => sum + t.estimateMinutes, 0);

  const projectedFinalMinutes = burnMinutes + remainingEstimateMinutes;
  const projectedFinalHours = Math.round((projectedFinalMinutes / 60) * 10) / 10;

  // Predict overrun date based on remaining capacity
  let predictedOverrunDate: string | null = null;
  const remainingBudgetMinutes = project.budgetMinutes - burnMinutes;
  if (remainingBudgetMinutes > 0 && remainingEstimateMinutes > remainingBudgetMinutes) {
    const overageMinutes = remainingEstimateMinutes - remainingBudgetMinutes;
    const avgMinutesPerDay = 8 * 60;
    const daysToOverrun = Math.ceil(overageMinutes / avgMinutesPerDay);
    const overrunDate = new Date(now.getTime() + daysToOverrun * 24 * 60 * 60 * 1000);
    predictedOverrunDate = overrunDate.toISOString().split("T")[0];
  } else if (projectedFinalMinutes > project.budgetMinutes) {
    predictedOverrunDate = now.toISOString().split("T")[0];
  }

  return {
    percentConsumed,
    loggedHours,
    budgetHours,
    projectedFinalHours,
    predictedOverrunDate,
  };
}

// ---------------------------------------------------------------------------
// Database fetchers
// ---------------------------------------------------------------------------

async function fetchProjectData(tenantId: string, projectId: string): Promise<ProjectRow[]> {
  const rows = await db.execute(sql`
    SELECT
      p.id,
      p.name,
      p.budget_minutes AS "budgetMinutes",
      p.status
    FROM projects p
    WHERE p.tenant_id = ${tenantId}
      AND p.id = ${projectId}
    LIMIT 1
  `);
  return rows.rows as ProjectRow[];
}

async function fetchProjectTasks(
  tenantId: string,
  projectId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<TaskRow[]> {
  const rows = await db.execute(sql`
    SELECT
      t.id,
      t.title,
      COALESCE(t.estimate_minutes, 0)::int AS "estimateMinutes",
      t.due_date::text AS "dueDate",
      t.status,
      t.priority,
      COALESCE(
        (SELECT array_agg(ta.user_id ORDER BY ta.created_at)
         FROM task_assignees ta
         WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId}),
        '{}'::varchar[]
      ) AS assignees
    FROM tasks t
    WHERE t.tenant_id = ${tenantId}
      AND t.project_id = ${projectId}
      AND t.archived_at IS NULL
      AND t.status NOT IN ('done', 'completed')
    ORDER BY t.created_at
  `);

  return (rows.rows as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    estimateMinutes: Number(r.estimateMinutes) || 0,
    dueDate: r.dueDate || null,
    status: r.status,
    priority: r.priority,
    assignees: Array.isArray(r.assignees) ? r.assignees : [],
  }));
}

async function fetchUserWorkloads(
  tenantId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<UserRow[]> {
  const rows = await db.execute(sql`
    SELECT
      u.id,
      COALESCE(u.name, CONCAT(u.first_name, ' ', u.last_name), u.email) AS name,
      COALESCE(
        (
          SELECT SUM(t2.estimate_minutes)::int
          FROM task_assignees ta
          JOIN tasks t2 ON t2.id = ta.task_id
          WHERE ta.user_id = u.id
            AND ta.tenant_id = ${tenantId}
            AND t2.status NOT IN ('done', 'completed')
            AND t2.archived_at IS NULL
            AND (
              t2.due_date IS NULL
              OR (t2.due_date >= ${rangeStart.toISOString()} AND t2.due_date <= ${rangeEnd.toISOString()})
            )
        ),
        0
      )::int AS "totalEstimateMinutes"
    FROM users u
    WHERE u.tenant_id = ${tenantId}
      AND u.is_active = true
      AND u.role IN ('admin', 'employee')
    ORDER BY u.first_name, u.last_name
  `);

  return (rows.rows as any[]).map((r) => ({
    id: r.id,
    name: r.name || r.id,
    totalEstimateMinutes: Number(r.totalEstimateMinutes) || 0,
  }));
}

async function fetchBurnData(tenantId: string, projectId: string): Promise<BurnRow[]> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(te.duration_seconds) / 60.0, 0)::float AS "burnMinutes",
      MIN(te.start_time)::text AS "startedAt"
    FROM time_entries te
    JOIN tasks t ON t.id = te.task_id
    WHERE te.tenant_id = ${tenantId}
      AND t.project_id = ${projectId}
      AND te.duration_seconds > 0
  `);

  return (rows.rows as any[]).map((r) => ({
    burnMinutes: Number(r.burnMinutes) || 0,
    startedAt: r.startedAt || null,
  }));
}
