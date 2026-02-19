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

const router = Router();

router.get("/time-entries/report/summary", async (req, res) => {
  try {
    const t0 = Date.now();
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { startDate, endDate, groupBy } = req.query;

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
    } else {
      entries = await storage.getTimeEntriesByWorkspace(workspaceId, filters);
      if (isSoftMode() && entries.some(e => !e.tenantId)) {
        addTenancyWarningHeader(res, "Report includes entries with legacy null tenantId");
      }
    }

    let totalSeconds = 0;
    let inScopeSeconds = 0;
    let outOfScopeSeconds = 0;

    const byClient: Record<string, { name: string; seconds: number }> = {};
    const byProject: Record<
      string,
      { name: string; clientName: string | null; seconds: number }
    > = {};
    const byUser: Record<string, { name: string; seconds: number }> = {};

    for (const entry of entries) {
      totalSeconds += entry.durationSeconds;
      if (entry.scope === "in_scope") {
        inScopeSeconds += entry.durationSeconds;
      } else {
        outOfScopeSeconds += entry.durationSeconds;
      }

      if (entry.clientId && entry.client) {
        if (!byClient[entry.clientId]) {
          byClient[entry.clientId] = {
            name: entry.client.displayName || entry.client.companyName,
            seconds: 0,
          };
        }
        byClient[entry.clientId].seconds += entry.durationSeconds;
      }

      if (entry.projectId && entry.project) {
        if (!byProject[entry.projectId]) {
          byProject[entry.projectId] = {
            name: entry.project.name,
            clientName:
              entry.client?.displayName || entry.client?.companyName || null,
            seconds: 0,
          };
        }
        byProject[entry.projectId].seconds += entry.durationSeconds;
      }

      if (entry.userId && entry.user) {
        if (!byUser[entry.userId]) {
          byUser[entry.userId] = {
            name: entry.user.name || entry.user.email,
            seconds: 0,
          };
        }
        byUser[entry.userId].seconds += entry.durationSeconds;
      }
    }

    const result = {
      totalSeconds,
      inScopeSeconds,
      outOfScopeSeconds,
      entryCount: entries.length,
      byClient: Object.entries(byClient).map(([id, data]) => ({
        id,
        ...data,
      })),
      byProject: Object.entries(byProject).map(([id, data]) => ({
        id,
        ...data,
      })),
      byUser: Object.entries(byUser).map(([id, data]) => ({ id, ...data })),
    };
    perfLog("GET /time-entries/report/summary", `${entries.length} entries aggregated in ${Date.now() - t0}ms (batched)`);
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
