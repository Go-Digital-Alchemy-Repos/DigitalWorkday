import { Router, Request, Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { handleRouteError } from "../../lib/errors";
import {
  reportingGuard,
  getTenantId,
} from "../../reports/utils";

const router = Router();
router.use(reportingGuard);

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

function parseHorizonWeeks(req: Request): 2 | 4 | 8 {
  const w = parseInt((req.query.weeks as string) || "4", 10);
  if (w <= 2) return 2;
  if (w >= 8) return 8;
  return 4;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function buildConfidence(timePct: number, estimatePct: number): "Low" | "Medium" | "High" {
  if (timePct >= 80 && estimatePct >= 60) return "High";
  if (timePct >= 50) return "Medium";
  return "Low";
}

function buildDataQualityFlags(timePct: number, estimatePct: number, histWeeks: number): string[] {
  const flags: string[] = [];
  if (timePct < 50) flags.push("LOW_TIME_TRACKING_COVERAGE");
  if (estimatePct < 30) flags.push("LOW_ESTIMATE_COVERAGE");
  if (histWeeks < 2) flags.push("SPARSE_HISTORY");
  return flags;
}

// ── CAPACITY OVERLOAD FORECAST ────────────────────────────────────────────────
// GET /forecasting/capacity-overload?weeks=2|4|8
router.get("/forecasting/capacity-overload", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const horizonWeeks = parseHorizonWeeks(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const asOfDate = new Date(today);

    const historyStart = addDays(today, -28);
    const historyEnd = new Date(today);

    const forecastStart = startOfMonday(today);
    const forecastEnd = addDays(forecastStart, horizonWeeks * 7 - 1);

    const forecastWeeks: Date[] = [];
    for (let i = 0; i < horizonWeeks; i++) {
      forecastWeeks.push(addDays(forecastStart, i * 7));
    }

    const historicalRows = await dbRows<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      week_start: string | null;
      actual_hours: string;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        to_char(date_trunc('week', te.start_time), 'YYYY-MM-DD') AS week_start,
        COALESCE(SUM(te.duration_seconds) / 3600.0, 0) AS actual_hours
      FROM users u
      LEFT JOIN time_entries te
        ON te.user_id = u.id
        AND te.tenant_id = ${tenantId}
        AND te.start_time >= ${isoDate(historyStart)}
        AND te.start_time < ${isoDate(historyEnd)}
      WHERE u.tenant_id = ${tenantId}
        AND u.role IN ('admin', 'employee')
      GROUP BY u.id, u.first_name, u.last_name, u.email, date_trunc('week', te.start_time)
      ORDER BY u.id, week_start
    `);

    const allUsersRows = await dbRows<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    }>(sql`
      SELECT id AS user_id, first_name, last_name, email
      FROM users
      WHERE tenant_id = ${tenantId}
        AND role IN ('admin', 'employee')
      ORDER BY last_name, first_name
    `);

    const workloadRows = await dbRows<{
      user_id: string;
      week_start: string;
      due_estimated_hours: string;
    }>(sql`
      SELECT
        ta.user_id,
        to_char(date_trunc('week', t.due_date), 'YYYY-MM-DD') AS week_start,
        COALESCE(SUM(t.estimate_minutes) / 60.0, 0) AS due_estimated_hours
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id AND ta.tenant_id = ${tenantId}
      WHERE t.tenant_id = ${tenantId}
        AND t.status NOT IN ('done', 'cancelled')
        AND t.due_date IS NOT NULL
        AND t.due_date BETWEEN ${isoDate(forecastStart)} AND ${isoDate(forecastEnd)}
      GROUP BY ta.user_id, date_trunc('week', t.due_date)
    `);

    const countRow = firstRow(await dbRows<{
      total_users: string;
      users_with_time: string;
      tasks_total: string;
      tasks_with_estimate: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = ${tenantId} AND role IN ('admin','employee')) AS total_users,
        (SELECT COUNT(DISTINCT user_id) FROM time_entries
          WHERE tenant_id = ${tenantId}
          AND start_time >= ${isoDate(historyStart)} AND start_time < ${isoDate(historyEnd)}) AS users_with_time,
        (SELECT COUNT(*) FROM tasks WHERE tenant_id = ${tenantId} AND status NOT IN ('done','cancelled')) AS tasks_total,
        (SELECT COUNT(*) FROM tasks WHERE tenant_id = ${tenantId} AND status NOT IN ('done','cancelled') AND estimate_minutes IS NOT NULL AND estimate_minutes > 0) AS tasks_with_estimate
    `));

    const totalUsers = Number(countRow?.total_users ?? 0);
    const usersWithTime = Number(countRow?.users_with_time ?? 0);
    const tasksTotal = Number(countRow?.tasks_total ?? 0);
    const tasksWithEst = Number(countRow?.tasks_with_estimate ?? 0);
    const timePct = totalUsers > 0 ? Math.round(usersWithTime / totalUsers * 100) : 0;
    const estimatePct = tasksTotal > 0 ? Math.round(tasksWithEst / tasksTotal * 100) : 0;

    const userActualByWeek = new Map<string, Map<string, number>>();
    for (const row of historicalRows) {
      if (!row.week_start) continue;
      if (!userActualByWeek.has(row.user_id)) userActualByWeek.set(row.user_id, new Map());
      userActualByWeek.get(row.user_id)!.set(row.week_start, Number(row.actual_hours));
    }

    const userDueEstByWeek = new Map<string, Map<string, number>>();
    for (const row of workloadRows) {
      if (!userDueEstByWeek.has(row.user_id)) userDueEstByWeek.set(row.user_id, new Map());
      userDueEstByWeek.get(row.user_id)!.set(row.week_start, Number(row.due_estimated_hours));
    }

    const distinctHistWeeks = new Set<string>();
    for (const row of historicalRows) {
      if (row.week_start) distinctHistWeeks.add(row.week_start);
    }

    const confidence = buildConfidence(timePct, estimatePct);
    const dataQualityFlags = buildDataQualityFlags(timePct, estimatePct, distinctHistWeeks.size);

    const users = allUsersRows.map((u) => {
      const weeklyMap = userActualByWeek.get(u.user_id) ?? new Map();
      const weeklyHours = Array.from(weeklyMap.values());
      const historicalAvg = weeklyHours.length > 0
        ? weeklyHours.reduce((a, b) => a + b, 0) / weeklyHours.length
        : 0;

      const weeks = forecastWeeks.map((wStart) => {
        const weekKey = isoDate(wStart);
        const dueEstimated = userDueEstByWeek.get(u.user_id)?.get(weekKey) ?? 0;
        const pressureFactor = Math.min(dueEstimated * 0.25, historicalAvg * 0.4);
        const predictedHours = Math.round((historicalAvg + pressureFactor) * 10) / 10;
        const predictedUtilizationPct = Math.round(predictedHours / 40 * 100);
        const overloadRisk: "Low" | "Medium" | "High" =
          predictedUtilizationPct >= 110 ? "High" :
          predictedUtilizationPct >= 90 ? "Medium" : "Low";

        const explanation: string[] = [];
        explanation.push(`Historical avg ${Math.round(historicalAvg * 10) / 10}h/wk over last 4 weeks`);
        if (dueEstimated > 0) explanation.push(`${Math.round(dueEstimated * 10) / 10}h of estimated work due this week`);
        explanation.push(`Predicted: ${predictedHours}h → ${predictedUtilizationPct}% of 40h`);
        if (overloadRisk === "High") explanation.push("⚠ High overload risk — over 110% capacity");
        else if (overloadRisk === "Medium") explanation.push("Approaching capacity threshold (90–110%)");

        return {
          weekStart: weekKey,
          availableHours: 40,
          historicalAvgHours: Math.round(historicalAvg * 10) / 10,
          dueEstimatedHours: Math.round(dueEstimated * 10) / 10,
          predictedHours,
          predictedUtilizationPct,
          overloadRisk,
          explanation,
        };
      });

      return {
        userId: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        weeks,
      };
    });

    res.json({
      asOfDate: asOfDate.toISOString(),
      horizonWeeks,
      confidence,
      modelVersion: "v1.0",
      dataQualityFlags,
      explanations: [
        "Predicted hours = historical 4-week average + 25% of estimated work due that week",
        "Overload risk: High ≥110%, Medium 90–109%, Low <90% of 40h",
        confidence === "Low" ? "Low confidence — limited time tracking history" : "",
      ].filter(Boolean),
      users,
    });
  } catch (err) {
    return handleRouteError(res, err, "GET /forecasting/capacity-overload", req);
  }
});

// ── PROJECT DEADLINE RISK FORECAST ───────────────────────────────────────────
// GET /forecasting/project-deadline-risk?weeks=2|4|8
router.get("/forecasting/project-deadline-risk", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const horizonWeeks = parseHorizonWeeks(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const historyStart = addDays(today, -28);

    const projectRows = await dbRows<{
      project_id: string;
      project_name: string;
      due_date: string | null;
      open_task_count: string;
      overdue_count: string;
      open_estimated_hours: string;
      completed_in_history: string;
    }>(sql`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        to_char(p.due_date, 'YYYY-MM-DD') AS due_date,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) AS open_task_count,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id
        END) AS overdue_count,
        COALESCE(SUM(CASE
          WHEN t.status NOT IN ('done','cancelled')
          THEN COALESCE(t.estimate_minutes, 0) ELSE 0
        END) / 60.0, 0) AS open_estimated_hours,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done'
          AND t.updated_at >= ${isoDate(historyStart)}
          THEN t.id
        END) AS completed_in_history
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      WHERE p.tenant_id = ${tenantId}
        AND p.status = 'active'
      GROUP BY p.id, p.name, p.due_date
      ORDER BY overdue_count DESC, open_task_count DESC
    `);

    const countRow = firstRow(await dbRows<{
      tasks_total: string;
      tasks_with_estimate: string;
    }>(sql`
      SELECT
        COUNT(*) AS tasks_total,
        COUNT(CASE WHEN estimate_minutes IS NOT NULL AND estimate_minutes > 0 THEN 1 END) AS tasks_with_estimate
      FROM tasks
      WHERE tenant_id = ${tenantId} AND status NOT IN ('done','cancelled')
    `));

    const tasksTotal = Number(countRow?.tasks_total ?? 0);
    const tasksWithEst = Number(countRow?.tasks_with_estimate ?? 0);
    const estimatePct = tasksTotal > 0 ? Math.round(tasksWithEst / tasksTotal * 100) : 0;

    const histWeeks = 4;
    const confidence = buildConfidence(60, estimatePct);
    const dataQualityFlags = buildDataQualityFlags(60, estimatePct, histWeeks);

    const projects = projectRows.map((row) => {
      const openTaskCount = Number(row.open_task_count);
      const overdueCount = Number(row.overdue_count);
      const openEstimatedHours = Math.round(Number(row.open_estimated_hours) * 10) / 10;
      const completedInHistory = Number(row.completed_in_history);
      const recentActualHours = Math.round(Number(row.recent_actual_hours) * 10) / 10;

      const throughputPerWeek = Math.round((completedInHistory / 4) * 10) / 10;
      const predictedWeeksToClear = openTaskCount > 0
        ? Math.round(openTaskCount / Math.max(throughputPerWeek, 0.5) * 10) / 10
        : 0;

      let weeksUntilDue: number | null = null;
      if (row.due_date) {
        const due = new Date(row.due_date);
        weeksUntilDue = Math.round((due.getTime() - today.getTime()) / (7 * 24 * 3600 * 1000) * 10) / 10;
      }

      let deadlineRisk: "Low" | "Medium" | "High";
      const explanation: string[] = [];

      explanation.push(`Open tasks: ${openTaskCount}, Overdue: ${overdueCount}`);
      explanation.push(`Throughput: ${throughputPerWeek} tasks/week over last 4 weeks`);
      explanation.push(`Predicted weeks to clear backlog: ${predictedWeeksToClear}`);
      if (openEstimatedHours > 0) explanation.push(`Open estimated work: ${openEstimatedHours}h`);
      if (recentActualHours > 0) explanation.push(`Recent actual work: ${recentActualHours}h over 4 weeks`);

      if (weeksUntilDue !== null) {
        explanation.push(`Due in ${weeksUntilDue} weeks`);
        if (weeksUntilDue < 0) {
          deadlineRisk = "High";
          explanation.push("⚠ Project past due date");
        } else if (predictedWeeksToClear > weeksUntilDue * 1.1 || overdueCount >= 3) {
          deadlineRisk = "High";
          explanation.push("⚠ Backlog too large to clear before deadline at current throughput");
        } else if (predictedWeeksToClear > weeksUntilDue * 0.75) {
          deadlineRisk = "Medium";
          explanation.push("Moderate risk — close to deadline with remaining backlog");
        } else {
          deadlineRisk = "Low";
        }
      } else {
        const overdueRate = openTaskCount > 0 ? overdueCount / openTaskCount : 0;
        if (overdueRate > 0.3 || overdueCount >= 5) {
          deadlineRisk = "High";
          explanation.push("⚠ High overdue ratio — no project due date set");
        } else if (overdueCount > 0) {
          deadlineRisk = "Medium";
        } else {
          deadlineRisk = "Low";
        }
      }

      return {
        projectId: row.project_id,
        projectName: row.project_name,
        dueDate: row.due_date ?? null,
        weeksUntilDue,
        openTaskCount,
        overdueCount,
        openEstimatedHours,
        throughputPerWeek,
        predictedWeeksToClear,
        recentActualHoursPerWeek: Math.round(recentActualHours / 4 * 10) / 10,
        deadlineRisk,
        explanation,
      };
    });

    res.json({
      asOfDate: today.toISOString(),
      horizonWeeks,
      confidence,
      modelVersion: "v1.0",
      dataQualityFlags,
      explanations: [
        "Throughput = completed tasks over last 4 weeks ÷ 4",
        "Predicted weeks to clear = open tasks ÷ max(throughput, 0.5)",
        "High risk if predicted weeks > weeks until due × 1.1, or project is overdue",
      ],
      projects,
    });
  } catch (err) {
    return handleRouteError(res, err, "GET /forecasting/project-deadline-risk", req);
  }
});

// ── CLIENT RISK TREND FORECAST ────────────────────────────────────────────────
// GET /forecasting/client-risk-trend?weeks=2|4|8
router.get("/forecasting/client-risk-trend", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const horizonWeeks = parseHorizonWeeks(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentStart = addDays(today, -30);
    const priorStart = addDays(today, -60);
    const priorEnd = addDays(today, -31);

    const clientRows = await dbRows<{
      client_id: string;
      company_name: string;
      curr_open: string;
      curr_overdue: string;
      curr_hours: string;
      curr_completed: string;
      curr_last_activity: string | null;
      prior_open: string;
      prior_overdue: string;
      prior_hours: string;
      prior_completed: string;
    }>(sql`
      SELECT
        c.id AS client_id,
        c.company_name,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) AS curr_open,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled') AND t.due_date < NOW() THEN t.id
        END) AS curr_overdue,
        COALESCE(SUM(CASE
          WHEN te.start_time >= ${isoDate(currentStart)} THEN te.duration_seconds ELSE 0
        END) / 3600.0, 0) AS curr_hours,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done' AND t.updated_at >= ${isoDate(currentStart)} THEN t.id
        END) AS curr_completed,
        MAX(CASE WHEN t.updated_at >= ${isoDate(currentStart)} THEN t.updated_at END) AS curr_last_activity,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled')
          AND t.created_at < ${isoDate(currentStart)} THEN t.id
        END) AS prior_open,
        COUNT(DISTINCT CASE
          WHEN t.status NOT IN ('done','cancelled')
          AND t.due_date < ${isoDate(currentStart)}
          AND t.created_at < ${isoDate(currentStart)} THEN t.id
        END) AS prior_overdue,
        COALESCE(SUM(CASE
          WHEN te.start_time >= ${isoDate(priorStart)}
          AND te.start_time < ${isoDate(currentStart)} THEN te.duration_seconds ELSE 0
        END) / 3600.0, 0) AS prior_hours,
        COUNT(DISTINCT CASE
          WHEN t.status = 'done'
          AND t.updated_at >= ${isoDate(priorStart)}
          AND t.updated_at < ${isoDate(currentStart)} THEN t.id
        END) AS prior_completed
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = ${tenantId}
      LEFT JOIN time_entries te ON te.tenant_id = ${tenantId}
        AND t.id IS NOT NULL
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.id, c.company_name
      ORDER BY c.company_name
    `);

    function computeHealthScore(
      openTasks: number,
      overdueTasks: number,
      hoursLogged: number,
      completed: number
    ): number {
      const overdueRateScore = openTasks > 0
        ? Math.max(0, 100 - (overdueTasks / openTasks) * 250)
        : 100;
      const engagementScore = Math.min(100, (hoursLogged / 40) * 100);
      const activityScore = Math.min(100, (completed / 5) * 100);
      return Math.round(
        overdueRateScore * 0.4 +
        engagementScore * 0.35 +
        activityScore * 0.25
      );
    }

    const confidence: "Low" | "Medium" | "High" = "Medium";
    const dataQualityFlags: string[] = ["NO_RESOURCE_ALLOCATIONS"];

    const clients = clientRows.map((row) => {
      const currOpen = Number(row.curr_open);
      const currOverdue = Number(row.curr_overdue);
      const currHours = Number(row.curr_hours);
      const currCompleted = Number(row.curr_completed);
      const priorOpen = Number(row.prior_open);
      const priorOverdue = Number(row.prior_overdue);
      const priorHours = Number(row.prior_hours);
      const priorCompleted = Number(row.prior_completed);

      const currentScore = computeHealthScore(currOpen, currOverdue, currHours, currCompleted);
      const priorScore = computeHealthScore(priorOpen, priorOverdue, priorHours, priorCompleted);

      const weeklySlope = (currentScore - priorScore) / 4;
      const projectedDelta = Math.round(weeklySlope * horizonWeeks);
      const predictedScore = Math.max(0, Math.min(100, currentScore + projectedDelta));

      const riskTrend: "Improving" | "Stable" | "Worsening" =
        weeklySlope > 1.5 ? "Improving" :
        weeklySlope < -1.5 ? "Worsening" : "Stable";

      const clientRisk: "Low" | "Medium" | "High" =
        currentScore < 40 || (riskTrend === "Worsening" && currentScore < 60) ? "High" :
        currentScore < 65 ? "Medium" : "Low";

      const explanation: string[] = [];
      explanation.push(`Current health score: ${currentScore}/100`);
      explanation.push(`Prior period score: ${priorScore}/100 (trend: ${weeklySlope > 0 ? "+" : ""}${Math.round(weeklySlope * 10) / 10}/wk)`);
      explanation.push(`Predicted score in ${horizonWeeks} weeks: ${predictedScore}/100`);
      if (currOverdue > 0) explanation.push(`${currOverdue} overdue tasks dragging score`);
      if (currHours < 1) explanation.push("Low time logged — possible disengagement");
      if (riskTrend === "Worsening") explanation.push("⚠ Trend is negative — monitor closely");
      else if (riskTrend === "Improving") explanation.push("Score trending upward");

      return {
        clientId: row.client_id,
        companyName: row.company_name,
        currentHealthScore: currentScore,
        priorHealthScore: priorScore,
        predictedHealthScore: predictedScore,
        riskTrend,
        clientRisk,
        weeklySlope: Math.round(weeklySlope * 10) / 10,
        explanation,
        metrics: {
          currOpenTasks: currOpen,
          currOverdueTasks: currOverdue,
          currHoursLogged: Math.round(currHours * 10) / 10,
          currCompleted,
        },
      };
    });

    const sortedClients = [...clients].sort((a, b) => {
      const riskOrder = { High: 0, Medium: 1, Low: 2 };
      return riskOrder[a.clientRisk] - riskOrder[b.clientRisk] || a.currentHealthScore - b.currentHealthScore;
    });

    res.json({
      asOfDate: today.toISOString(),
      horizonWeeks,
      confidence,
      modelVersion: "v1.0",
      dataQualityFlags,
      explanations: [
        "Health score = weighted composite: overdue rate (40%), engagement/hours (35%), task completion (25%)",
        "Trend = slope from prior 30 days to current 30 days, projected forward",
        "Risk: High if score < 40 or worsening below 60, Medium if score < 65, Low otherwise",
      ],
      clients: sortedClients,
    });
  } catch (err) {
    return handleRouteError(res, err, "GET /forecasting/client-risk-trend", req);
  }
});

export default router;
