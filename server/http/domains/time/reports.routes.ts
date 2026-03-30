import { Router } from "express";
import {
  storage,
  handleRouteError,
  getEffectiveTenantId,
  isStrictMode,
  isSoftMode,
  addTenancyWarningHeader,
  getCurrentWorkspaceId,
} from "./shared";
import { perfLog } from "../../../lib/queryDebug";
import { TimeTrackingRepository } from "../../../storage/timeTracking.repo";

const timeTrackingRepo = new TimeTrackingRepository();
const router = Router();

router.get("/time-entries/report/summary", async (req, res) => {
  try {
    const t0 = Date.now();
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { startDate, endDate } = req.query;

    const dateFilters: { startDate?: Date; endDate?: Date } = {};
    if (startDate) dateFilters.startDate = new Date(startDate as string);
    if (endDate) dateFilters.endDate = new Date(endDate as string);

    const scopeOpts = {
      tenantId: tenantId && isStrictMode() ? tenantId : undefined,
      workspaceId,
    };

    if (isSoftMode() && !(tenantId && isStrictMode())) {
      const hasNullTenant = await timeTrackingRepo.hasEntriesWithNullTenant(workspaceId, dateFilters);
      if (hasNullTenant) {
        addTenancyWarningHeader(res, "Report includes entries with legacy null tenantId");
      }
    }

    const [totals, byClient, byProject, byUser] = await Promise.all([
      timeTrackingRepo.getReportTotals(scopeOpts, dateFilters),
      timeTrackingRepo.getReportByClient(scopeOpts, dateFilters),
      timeTrackingRepo.getReportByProject(scopeOpts, dateFilters),
      timeTrackingRepo.getReportByUser(scopeOpts, dateFilters),
    ]);

    const result = {
      totalSeconds: totals.totalSeconds,
      inScopeSeconds: totals.inScopeSeconds,
      outOfScopeSeconds: totals.outOfScopeSeconds,
      entryCount: totals.entryCount,
      byClient,
      byProject,
      byUser,
    };
    perfLog("GET /time-entries/report/summary", `SQL aggregated in ${Date.now() - t0}ms`);
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/report/summary", req);
  }
});

router.get("/time-entries/export/csv", async (req, res) => {
  try {
    const { startDate, endDate, clientId, projectId } = req.query;

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (clientId) filters.clientId = clientId as string;
    if (projectId) filters.projectId = projectId as string;

    const entries = await storage.getTimeEntriesByWorkspace(
      getCurrentWorkspaceId(req),
      filters,
    );

    const headers = [
      "Date",
      "Start Time",
      "End Time",
      "Duration (hours)",
      "Client",
      "Project",
      "Task",
      "Description",
      "Scope",
      "User",
      "Entry Type",
    ];
    const rows = entries.map((entry) => {
      const duration = (entry.durationSeconds / 3600).toFixed(2);
      return [
        entry.startTime.toISOString().split("T")[0],
        entry.startTime.toISOString().split("T")[1].slice(0, 8),
        entry.endTime?.toISOString().split("T")[1].slice(0, 8) || "",
        duration,
        entry.client?.displayName || entry.client?.companyName || "",
        entry.project?.name || "",
        entry.task?.title || "",
        entry.description || "",
        entry.scope,
        entry.user?.name || entry.user?.email || "",
        entry.isManual ? "Manual" : "Timer",
      ];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="time-entries-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/export/csv", req);
  }
});

export default router;
