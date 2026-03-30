import { Router } from "express";
import {
  storage,
  handleRouteError,
  AppError,
  insertTimeEntrySchema,
  getEffectiveTenantId,
  isStrictMode,
  isSoftMode,
  addTenancyWarningHeader,
  logTenancyWarning,
  getCurrentUserId,
  getCurrentWorkspaceId,
  emitTimeEntryCreated,
  emitTimeEntryUpdated,
  emitTimeEntryDeleted,
} from "./shared";
import { perfLog } from "../../../lib/queryDebug";
import { TimeTrackingRepository } from "../../../storage/timeTracking.repo";

const timeTrackingRepo = new TimeTrackingRepository();

const router = Router();

/**
 * GET /api/time-entries
 *
 * Supports two response modes:
 *
 * 1. **Flat array (backward-compatible)** — When `limit` is NOT provided, returns
 *    a flat JSON array of time entries. Existing consumers (task-detail-drawer,
 *    client-profile-report, etc.) that pass date-range or entity filters rely on
 *    this shape and are unaffected.
 *
 * 2. **Cursor-paginated** — When `limit` is provided (max 50), returns:
 *    ```json
 *    {
 *      "items": [ ... ],      // TimeEntry[] for this page
 *      "hasMore": true|false, // whether more pages exist
 *      "nextCursor": "...",   // ISO-8601 startTime string for the next page, or null
 *      "totalCount": 123      // total matching entries (ignoring cursor)
 *    }
 *    ```
 *    Pass `cursor` (an ISO timestamp from a previous `nextCursor`) to fetch
 *    subsequent pages. Entries are ordered by `startTime DESC`.
 *
 * Additional query params: userId, clientId, projectId, taskId, scope,
 * startDate, endDate, fields ("list" for flat list items).
 */
router.get("/time-entries", async (req, res) => {
  try {
    const t0 = Date.now();
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { userId, clientId, projectId, taskId, scope, startDate, endDate, fields } = req.query;

    const filters: {
      userId?: string;
      clientId?: string;
      projectId?: string;
      taskId?: string;
      scope?: "in_scope" | "out_of_scope";
      startDate?: Date;
      endDate?: Date;
    } = {};
    if (userId) filters.userId = userId as string;
    if (clientId) filters.clientId = clientId as string;
    if (projectId) filters.projectId = projectId as string;
    if (taskId) filters.taskId = taskId as string;
    if (scope) filters.scope = scope as "in_scope" | "out_of_scope";
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    const useListMode = fields === "list";

    const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const usePagination = limitParam !== undefined && !isNaN(limitParam);

    if (usePagination) {
      const limit = Math.min(Math.max(limitParam, 1), 50);
      const cursor = req.query.cursor as string | undefined;
      const pagination = { cursor, limit };

      let result;
      if (tenantId && isStrictMode()) {
        result = await storage.getTimeEntriesByTenantFlatPaginated(tenantId, workspaceId, pagination, filters);
      } else {
        result = await storage.getTimeEntriesByWorkspaceFlatPaginated(workspaceId, pagination, filters);
      }
      perfLog("GET /time-entries", `${result.items.length}/${result.totalCount} entries in ${Date.now() - t0}ms (paginated)`);
      return res.json(result);
    }

    let entries;
    if (tenantId && isStrictMode()) {
      entries = useListMode
        ? await storage.getTimeEntriesByTenantFlat(tenantId, workspaceId, filters)
        : await storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
    } else {
      entries = useListMode
        ? await storage.getTimeEntriesByWorkspaceFlat(workspaceId, filters)
        : await storage.getTimeEntriesByWorkspace(workspaceId, filters);
      if (isSoftMode() && entries.some((e) => !e.tenantId)) {
        addTenancyWarningHeader(res, "Results include entries with legacy null tenantId");
      }
    }
    perfLog("GET /time-entries", `${entries.length} entries in ${Date.now() - t0}ms (batched${useListMode ? ', flat' : ''})`);
    res.json(entries);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries", req);
  }
});

/**
 * GET /api/time-entries/my
 *
 * Same pagination contract as GET /api/time-entries (see above).
 * Automatically scoped to the current authenticated user.
 */
router.get("/time-entries/my", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const fields = req.query.fields as string | undefined;
    const useListMode = fields === "list";

    const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const usePagination = limitParam !== undefined && !isNaN(limitParam);

    if (usePagination) {
      const limit = Math.min(Math.max(limitParam, 1), 50);
      const cursor = req.query.cursor as string | undefined;
      const pagination = { cursor, limit };

      let result;
      if (tenantId && isStrictMode()) {
        result = await storage.getTimeEntriesByTenantFlatPaginated(tenantId, workspaceId, pagination, { userId });
      } else {
        result = await storage.getTimeEntriesByUserFlatPaginated(userId, workspaceId, pagination);
      }
      return res.json(result);
    }
    
    let entries;
    if (tenantId && isStrictMode()) {
      entries = useListMode
        ? await storage.getTimeEntriesByTenantFlat(tenantId, workspaceId, { userId })
        : await storage.getTimeEntriesByTenant(tenantId, workspaceId, { userId });
    } else {
      entries = useListMode
        ? await storage.getTimeEntriesByUserFlat(userId, workspaceId)
        : await storage.getTimeEntriesByUser(userId, workspaceId);
      if (isSoftMode() && entries.some((e) => !e.tenantId)) {
        addTenancyWarningHeader(res, "Results include entries with legacy null tenantId");
      }
    }
    res.json(entries);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/my", req);
  }
});

router.get("/time-entries/my/stats", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    const scopeOpts = {
      tenantId: tenantId && isStrictMode() ? tenantId : undefined,
      workspaceId,
      userId,
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayOfWeek = now.getDay();
    const weekStart = new Date(todayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [periodTotals, allTime, dailyBreakdown, dayTotals, missingDescriptions, lastEntryId] = await Promise.all([
      timeTrackingRepo.getAggregatedPeriodTotals(scopeOpts, [
        { name: 'today', start: todayStart, end: todayEnd },
        { name: 'thisWeek', start: weekStart, end: weekEnd },
        { name: 'thisMonth', start: monthStart, end: monthEnd },
      ]),
      timeTrackingRepo.getAllTimeTotals(scopeOpts),
      timeTrackingRepo.getDailyBreakdown(scopeOpts, weekStart, weekEnd),
      timeTrackingRepo.getDayTotalsForMonth(scopeOpts, monthStart, monthEnd),
      timeTrackingRepo.getMissingDescriptionEntries(scopeOpts, thirtyDaysAgo, 10),
      timeTrackingRepo.getLastEntryId(scopeOpts),
    ]);

    const longRunningDays = dayTotals
      .filter(d => d.totalSeconds > 28800)
      .map(d => ({ date: d.date, hours: Math.round(d.totalSeconds / 3600 * 10) / 10 }))
      .slice(0, 5);

    res.json({
      today: periodTotals['today'],
      thisWeek: periodTotals['thisWeek'],
      thisMonth: periodTotals['thisMonth'],
      allTime: allTime,
      dailyBreakdown,
      warnings: {
        missingDescriptions,
        longRunningDays,
      },
      lastEntryId,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/my/stats", req);
  }
});

router.get("/time-entries/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    
    let entry;
    if (tenantId && isStrictMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
    } else if (tenantId && isSoftMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      if (!entry) {
        const legacyEntry = await storage.getTimeEntry(req.params.id);
        if (legacyEntry && !legacyEntry.tenantId) {
          entry = legacyEntry;
          addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
          logTenancyWarning("time-entries/:id", "Legacy time entry without tenantId", userId);
        }
      }
    } else {
      entry = await storage.getTimeEntry(req.params.id);
    }
    
    if (!entry) throw AppError.notFound("Time entry");
    res.json(entry);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/:id", req);
  }
});

router.post("/time-entries", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const userId = getCurrentUserId(req);
    const { startTime, endTime, durationSeconds, ...rest } = req.body;

    let duration = durationSeconds;
    let start = startTime ? new Date(startTime) : new Date();
    let end = endTime ? new Date(endTime) : null;

    if (!duration && start && end) {
      duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    } else if (duration && !end) {
      end = new Date(start.getTime() + duration * 1000);
    }

    const data = insertTimeEntrySchema.parse({
      ...rest,
      workspaceId,
      userId,
      startTime: start,
      endTime: end,
      durationSeconds: duration || 0,
      isManual: true,
      scope: rest.scope || "in_scope",
    });

    let entry;
    if (tenantId) {
      entry = await storage.createTimeEntryWithTenant(data, tenantId);
    } else {
      entry = await storage.createTimeEntry(data);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Time entry created without tenant context");
        logTenancyWarning("time-entries/create", "Time entry created without tenantId", userId);
      }
    }

    emitTimeEntryCreated(
      {
        id: entry.id,
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        clientId: entry.clientId,
        projectId: entry.projectId,
        taskId: entry.taskId,
        description: entry.description,
        startTime: entry.startTime,
        endTime: entry.endTime,
        durationSeconds: entry.durationSeconds,
        scope: entry.scope as "in_scope" | "out_of_scope",
        isManual: entry.isManual,
        createdAt: entry.createdAt,
      },
      workspaceId,
    );

    res.status(201).json(entry);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/time-entries", req);
  }
});

router.patch("/time-entries/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const userId = getCurrentUserId(req);
    
    let entry;
    if (tenantId && isStrictMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
    } else if (tenantId && isSoftMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      if (!entry) {
        const legacyEntry = await storage.getTimeEntry(req.params.id);
        if (legacyEntry && !legacyEntry.tenantId) {
          entry = legacyEntry;
          addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
          logTenancyWarning("time-entries/update", "Legacy time entry without tenantId", userId);
        }
      }
    } else {
      entry = await storage.getTimeEntry(req.params.id);
    }
    
    if (!entry) throw AppError.notFound("Time entry");

    const { startTime, endTime, durationSeconds, clientId, projectId, taskId, ...rest } = req.body;

    const finalClientId = clientId !== undefined ? clientId : entry.clientId;
    const finalProjectId = projectId !== undefined ? projectId : entry.projectId;
    const finalTaskId = taskId !== undefined ? taskId : entry.taskId;

    if (finalProjectId) {
      const project = await storage.getProject(finalProjectId);
      if (!project) throw AppError.badRequest("Project not found");
      if (project.workspaceId !== workspaceId) throw AppError.forbidden("Project does not belong to current workspace");
      if (finalClientId && project.clientId !== finalClientId) throw AppError.badRequest("Project does not belong to the selected client");
    }

    if (finalTaskId) {
      const task = await storage.getTask(finalTaskId);
      if (!task) throw AppError.badRequest("Task not found");
      if (task.projectId !== finalProjectId) throw AppError.badRequest("Task does not belong to the selected project");
    }

    if (durationSeconds !== undefined && durationSeconds <= 0) throw AppError.badRequest("Duration must be greater than zero");

    const updates: any = { ...rest };
    if (clientId !== undefined) updates.clientId = clientId;
    if (projectId !== undefined) updates.projectId = projectId;
    if (taskId !== undefined) updates.taskId = taskId;
    if (startTime) updates.startTime = new Date(startTime);
    if (endTime !== undefined) updates.endTime = endTime ? new Date(endTime) : null;
    if (durationSeconds !== undefined) updates.durationSeconds = durationSeconds;

    let updated;
    if (entry.tenantId) {
      updated = await storage.updateTimeEntryWithTenant(req.params.id, entry.tenantId, updates);
    } else {
      updated = await storage.updateTimeEntry(req.params.id, updates);
      if (isSoftMode()) {
        logTenancyWarning("time-entries/update", "Updated legacy time entry without tenantId", userId);
      }
    }

    emitTimeEntryUpdated(req.params.id, workspaceId, updates);

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/time-entries/:id", req);
  }
});

router.delete("/time-entries/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    
    let entry;
    if (tenantId && isStrictMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
    } else if (tenantId && isSoftMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      if (!entry) {
        const legacyEntry = await storage.getTimeEntry(req.params.id);
        if (legacyEntry && !legacyEntry.tenantId) {
          entry = legacyEntry;
          addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
          logTenancyWarning("time-entries/delete", "Legacy time entry without tenantId", userId);
        }
      }
    } else {
      entry = await storage.getTimeEntry(req.params.id);
    }
    
    if (!entry) throw AppError.notFound("Time entry");

    if (entry.tenantId) {
      await storage.deleteTimeEntryWithTenant(req.params.id, entry.tenantId);
    } else {
      await storage.deleteTimeEntry(req.params.id);
      if (isSoftMode()) {
        logTenancyWarning("time-entries/delete", "Deleted legacy time entry without tenantId", userId);
      }
    }

    emitTimeEntryDeleted(req.params.id, getCurrentWorkspaceId(req));

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/time-entries/:id", req);
  }
});

export default router;
