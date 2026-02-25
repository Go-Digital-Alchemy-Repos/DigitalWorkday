import { Router, Request, Response } from "express";
import { handleRouteError } from "../../lib/errors";
import { reportingGuard, getTenantId } from "../../reports/utils";
import {
  createForecastSnapshot,
  listForecastSnapshots,
  getForecastSnapshot,
  SnapshotType,
  CapacityOverloadResult,
  ProjectDeadlineRiskResult,
  ClientRiskTrendResult,
} from "../../reports/forecasting/snapshotService";

const router = Router();
router.use(reportingGuard);

const VALID_TYPES: SnapshotType[] = ["capacity_overload", "project_deadline_risk", "client_risk_trend"];

// GET /forecasting/snapshots?type=&weeks=&limit=&cursor=
router.get("/forecasting/snapshots", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const snapshotType = req.query.type as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || "20", 10), 50);
    const cursor = req.query.cursor as string | undefined;

    if (snapshotType && !VALID_TYPES.includes(snapshotType as SnapshotType)) {
      return res.status(400).json({ error: "Invalid snapshot type" });
    }

    const result = await listForecastSnapshots(tenantId, { snapshotType, limit, cursor });
    res.json(result);
  } catch (err) {
    return handleRouteError(res, err, "GET /forecasting/snapshots", req);
  }
});

// GET /forecasting/snapshots/:snapshotId
router.get("/forecasting/snapshots/:snapshotId", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const snapshot = await getForecastSnapshot(tenantId, req.params.snapshotId);
    if (!snapshot) return res.status(404).json({ error: "Snapshot not found" });
    res.json(snapshot);
  } catch (err) {
    return handleRouteError(res, err, "GET /forecasting/snapshots/:id", req);
  }
});

// POST /forecasting/snapshots
router.post("/forecasting/snapshots", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const user = req.user as { id: string };
    const { snapshotType, horizonWeeks } = req.body;

    if (!snapshotType || !VALID_TYPES.includes(snapshotType)) {
      return res.status(400).json({ error: "snapshotType must be one of: " + VALID_TYPES.join(", ") });
    }

    const snapshot = await createForecastSnapshot({
      tenantId,
      snapshotType,
      horizonWeeks: Number(horizonWeeks) || 4,
      createdByUserId: user?.id ?? null,
    });

    res.status(201).json(snapshot);
  } catch (err) {
    return handleRouteError(res, err, "POST /forecasting/snapshots", req);
  }
});

// GET /forecasting/snapshots/:snapshotId/export?format=csv
router.get("/forecasting/snapshots/:snapshotId/export", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const snapshot = await getForecastSnapshot(tenantId, req.params.snapshotId);
    if (!snapshot) return res.status(404).json({ error: "Snapshot not found" });

    const format = (req.query.format as string || "csv").toLowerCase();
    if (format !== "csv") return res.status(400).json({ error: "Only CSV format supported" });

    const asOf = new Date(snapshot.asOfDate).toISOString().split("T")[0];
    const filename = `forecast_${snapshot.snapshotType}_${asOf}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const payload = snapshot.payloadJson as Record<string, unknown>;

    if (snapshot.snapshotType === "capacity_overload") {
      const data = payload as CapacityOverloadResult;
      res.write("user_id,name,email,week_start,predicted_hours,utilization_pct,overload_risk\n");
      for (const u of data.users ?? []) {
        for (const w of u.weeks ?? []) {
          const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
          res.write(`${u.userId},"${name}",${u.email},${w.weekStart},${w.predictedHours},${w.predictedUtilizationPct},${w.overloadRisk}\n`);
        }
      }
    } else if (snapshot.snapshotType === "project_deadline_risk") {
      const data = payload as ProjectDeadlineRiskResult;
      res.write("project_id,project_name,due_date,weeks_until_due,open_tasks,overdue_tasks,throughput_per_week,predicted_weeks_to_clear,deadline_risk\n");
      for (const p of data.projects ?? []) {
        res.write(`${p.projectId},"${p.projectName}",${p.dueDate ?? ""},${p.weeksUntilDue ?? ""},${p.openTaskCount},${p.overdueCount},${p.throughputPerWeek},${p.predictedWeeksToClear},${p.deadlineRisk}\n`);
      }
    } else if (snapshot.snapshotType === "client_risk_trend") {
      const data = payload as ClientRiskTrendResult;
      res.write("client_id,company_name,current_health_score,prior_health_score,predicted_health_score,risk_trend,client_risk,weekly_slope\n");
      for (const c of data.clients ?? []) {
        res.write(`${c.clientId},"${c.companyName}",${c.currentHealthScore},${c.priorHealthScore},${c.predictedHealthScore},${c.riskTrend},${c.clientRisk},${c.weeklySlope}\n`);
      }
    }

    res.end();
  } catch (err) {
    return handleRouteError(res, err, "GET /forecasting/snapshots/:id/export", req);
  }
});

export default router;
