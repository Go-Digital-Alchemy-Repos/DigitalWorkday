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

const router = Router();

router.get("/time-entries", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { userId, clientId, projectId, taskId, scope, startDate, endDate } = req.query;

    const filters: any = {};
    if (userId) filters.userId = userId as string;
    if (clientId) filters.clientId = clientId as string;
    if (projectId) filters.projectId = projectId as string;
    if (taskId) filters.taskId = taskId as string;
    if (scope) filters.scope = scope as "in_scope" | "out_of_scope";
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
    } else {
      entries = await storage.getTimeEntriesByWorkspace(workspaceId, filters);
      if (isSoftMode() && entries.some(e => !e.tenantId)) {
        addTenancyWarningHeader(res, "Results include entries with legacy null tenantId");
      }
    }
    res.json(entries);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries", req);
  }
});

router.get("/time-entries/my", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    
    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { userId });
    } else {
      entries = await storage.getTimeEntriesByUser(userId, workspaceId);
      if (isSoftMode() && entries.some(e => !e.tenantId)) {
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
    
    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { userId });
    } else {
      entries = await storage.getTimeEntriesByUser(userId, workspaceId);
    }
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const dayOfWeek = now.getDay();
    const weekStart = new Date(todayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    let todaySeconds = 0, todayBillable = 0, todayUnbillable = 0;
    let weekSeconds = 0, weekBillable = 0, weekUnbillable = 0;
    let monthSeconds = 0, monthBillable = 0, monthUnbillable = 0;
    let totalSeconds = 0, totalBillable = 0, totalUnbillable = 0;
    
    const dailyBreakdown: Record<string, { date: string; total: number; billable: number; unbillable: number }> = {};
    const entriesWithMissingDescriptions: Array<{ id: string; date: string; duration: number; clientName?: string; projectName?: string }> = [];
    const dayTotals: Record<string, number> = {};
    
    for (const entry of entries) {
      const entryDate = new Date(entry.startTime);
      const isBillable = entry.scope === "out_of_scope";
      const seconds = entry.durationSeconds;
      
      totalSeconds += seconds;
      if (isBillable) totalBillable += seconds;
      else totalUnbillable += seconds;
      
      if (entryDate >= todayStart && entryDate < todayEnd) {
        todaySeconds += seconds;
        if (isBillable) todayBillable += seconds;
        else todayUnbillable += seconds;
      }
      
      if (entryDate >= weekStart && entryDate < weekEnd) {
        weekSeconds += seconds;
        if (isBillable) weekBillable += seconds;
        else weekUnbillable += seconds;
        
        const dateKey = entryDate.toISOString().split('T')[0];
        if (!dailyBreakdown[dateKey]) {
          dailyBreakdown[dateKey] = { date: dateKey, total: 0, billable: 0, unbillable: 0 };
        }
        dailyBreakdown[dateKey].total += seconds;
        if (isBillable) dailyBreakdown[dateKey].billable += seconds;
        else dailyBreakdown[dateKey].unbillable += seconds;
      }
      
      if (entryDate >= monthStart && entryDate < monthEnd) {
        monthSeconds += seconds;
        if (isBillable) monthBillable += seconds;
        else monthUnbillable += seconds;
        
        const dateKey = entryDate.toISOString().split('T')[0];
        dayTotals[dateKey] = (dayTotals[dateKey] || 0) + seconds;
      }
      
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (entryDate >= thirtyDaysAgo && (!entry.description || entry.description.trim() === '')) {
        entriesWithMissingDescriptions.push({
          id: entry.id,
          date: entryDate.toISOString(),
          duration: seconds,
          clientName: entry.client?.displayName || entry.client?.legalName,
          projectName: entry.project?.name,
        });
      }
    }
    
    const longRunningDays = Object.entries(dayTotals)
      .filter(([_, seconds]) => seconds > 28800)
      .map(([date, seconds]) => ({ date, hours: Math.round(seconds / 3600 * 10) / 10 }));
    
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    const lastEntry = sortedEntries[0];
    
    res.json({
      today: { total: todaySeconds, billable: todayBillable, unbillable: todayUnbillable },
      thisWeek: { total: weekSeconds, billable: weekBillable, unbillable: weekUnbillable },
      thisMonth: { total: monthSeconds, billable: monthBillable, unbillable: monthUnbillable },
      allTime: { total: totalSeconds, billable: totalBillable, unbillable: totalUnbillable },
      dailyBreakdown: Object.values(dailyBreakdown).sort((a, b) => a.date.localeCompare(b.date)),
      warnings: {
        missingDescriptions: entriesWithMissingDescriptions.slice(0, 10),
        longRunningDays: longRunningDays.slice(0, 5),
      },
      lastEntryId: lastEntry?.id || null,
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
