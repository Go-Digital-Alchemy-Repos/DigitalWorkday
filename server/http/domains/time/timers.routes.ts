import { Router } from "express";
import {
  storage,
  handleRouteError,
  AppError,
  insertActiveTimerSchema,
  ActiveTimer,
  getEffectiveTenantId,
  isStrictMode,
  isSoftMode,
  addTenancyWarningHeader,
  logTenancyWarning,
  getCurrentUserId,
  getCurrentWorkspaceId,
  emitTimerStarted,
  emitTimerPaused,
  emitTimerResumed,
  emitTimerStopped,
  emitTimerUpdated,
  emitTimeEntryCreated,
} from "./shared";

const router = Router();

router.get("/timer/current", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/current", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    res.json(timer || null);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/timer/current", req);
  }
});

router.post("/timer/start", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let existingTimer;
    if (tenantId && isStrictMode()) {
      existingTimer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      existingTimer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!existingTimer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          existingTimer = legacyTimer;
          logTenancyWarning("timer/start", "Existing legacy timer found without tenantId", userId);
        }
      }
    } else {
      existingTimer = await storage.getActiveTimerByUser(userId);
    }
    
    if (existingTimer) {
      if (isSoftMode() && !existingTimer.tenantId) {
        addTenancyWarningHeader(res, "Existing timer has legacy null tenantId");
      }
      throw AppError.conflict("You already have an active timer. Stop it before starting a new one.");
    }

    const now = new Date();
    const data = insertActiveTimerSchema.parse({
      workspaceId: getCurrentWorkspaceId(req),
      userId: userId,
      clientId: req.body.clientId || null,
      projectId: req.body.projectId || null,
      taskId: req.body.taskId || null,
      title: req.body.title || null,
      description: req.body.description || null,
      status: "running",
      elapsedSeconds: 0,
      lastStartedAt: now,
    });

    let timer;
    if (tenantId) {
      timer = await storage.createActiveTimerWithTenant(data, tenantId);
    } else {
      timer = await storage.createActiveTimer(data);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Timer created without tenant context");
        logTenancyWarning("timer/start", "Timer created without tenantId", userId);
      }
    }

    const enrichedTimer = await storage.getActiveTimerByUser(userId);

    emitTimerStarted(
      {
        id: timer.id,
        userId: timer.userId,
        workspaceId: timer.workspaceId,
        clientId: timer.clientId,
        projectId: timer.projectId,
        taskId: timer.taskId,
        description: timer.description,
        status: timer.status as "running" | "paused",
        elapsedSeconds: timer.elapsedSeconds,
        lastStartedAt: timer.lastStartedAt || now,
        createdAt: timer.createdAt,
      },
      getCurrentWorkspaceId(req),
    );

    res.status(201).json(enrichedTimer);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/start", req);
  }
});

router.post("/timer/pause", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/pause", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) throw AppError.notFound("No active timer found");
    if (timer.status !== "running") throw AppError.badRequest("Timer is not running");

    const now = new Date();
    const lastStarted = timer.lastStartedAt || timer.createdAt;
    const additionalSeconds = Math.floor((now.getTime() - lastStarted.getTime()) / 1000);
    const newElapsedSeconds = timer.elapsedSeconds + additionalSeconds;

    let updated;
    if (timer.tenantId) {
      updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, {
        status: "paused",
        elapsedSeconds: newElapsedSeconds,
      });
    } else {
      updated = await storage.updateActiveTimer(timer.id, {
        status: "paused",
        elapsedSeconds: newElapsedSeconds,
      });
      if (isSoftMode()) {
        logTenancyWarning("timer/pause", "Updated legacy timer without tenantId", userId);
      }
    }

    emitTimerPaused(timer.id, userId, newElapsedSeconds, getCurrentWorkspaceId(req));

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/pause", req);
  }
});

router.post("/timer/resume", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/resume", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) throw AppError.notFound("No active timer found");
    if (timer.status !== "paused") throw AppError.badRequest("Timer is not paused");

    const now = new Date();
    let updated;
    if (timer.tenantId) {
      updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, {
        status: "running",
        lastStartedAt: now,
      });
    } else {
      updated = await storage.updateActiveTimer(timer.id, {
        status: "running",
        lastStartedAt: now,
      });
      if (isSoftMode()) {
        logTenancyWarning("timer/resume", "Resumed legacy timer without tenantId", userId);
      }
    }

    emitTimerResumed(timer.id, userId, now, getCurrentWorkspaceId(req));

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/resume", req);
  }
});

router.patch("/timer/current", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/update", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) throw AppError.notFound("No active timer found");

    const allowedUpdates: Partial<ActiveTimer> = {};
    if ("clientId" in req.body) allowedUpdates.clientId = req.body.clientId;
    if ("projectId" in req.body) allowedUpdates.projectId = req.body.projectId;
    if ("taskId" in req.body) allowedUpdates.taskId = req.body.taskId;
    if ("description" in req.body) allowedUpdates.description = req.body.description;

    let updated;
    if (timer.tenantId) {
      updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, allowedUpdates);
    } else {
      updated = await storage.updateActiveTimer(timer.id, allowedUpdates);
      if (isSoftMode()) {
        logTenancyWarning("timer/update", "Updated legacy timer without tenantId", userId);
      }
    }

    emitTimerUpdated(timer.id, userId, allowedUpdates as any, getCurrentWorkspaceId(req));

    const enrichedTimer = await storage.getActiveTimerByUser(userId);
    res.json(enrichedTimer);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/timer/current", req);
  }
});

router.post("/timer/stop", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/stop", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) throw AppError.notFound("No active timer found");

    let finalElapsedSeconds = timer.elapsedSeconds;
    if (timer.status === "running") {
      const now = new Date();
      const lastStarted = timer.lastStartedAt || timer.createdAt;
      const additionalSeconds = Math.floor((now.getTime() - lastStarted.getTime()) / 1000);
      finalElapsedSeconds += additionalSeconds;
    }

    const { discard, scope, title, description, clientId, projectId, taskId } = req.body;

    let timeEntryId: string | null = null;

    if (!discard && finalElapsedSeconds > 0) {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - finalElapsedSeconds * 1000);

      const entryData = {
        workspaceId,
        userId,
        clientId: clientId !== undefined ? clientId : timer.clientId,
        projectId: projectId !== undefined ? projectId : timer.projectId,
        taskId: taskId !== undefined ? taskId : timer.taskId,
        title: title !== undefined ? title : null,
        description: description !== undefined ? description : timer.description,
        startTime,
        endTime,
        durationSeconds: finalElapsedSeconds,
        scope: scope || "in_scope",
        isManual: false,
      };

      let timeEntry;
      const effectiveTenantId = timer.tenantId || tenantId;
      if (effectiveTenantId) {
        timeEntry = await storage.createTimeEntryWithTenant(entryData, effectiveTenantId);
      } else {
        timeEntry = await storage.createTimeEntry(entryData);
        if (isSoftMode()) {
          addTenancyWarningHeader(res, "Time entry created without tenantId");
          logTenancyWarning("timer/stop", "Time entry created without tenantId", userId);
        }
      }

      timeEntryId = timeEntry.id;

      emitTimeEntryCreated(
        {
          id: timeEntry.id,
          workspaceId: timeEntry.workspaceId,
          userId: timeEntry.userId,
          clientId: timeEntry.clientId,
          projectId: timeEntry.projectId,
          taskId: timeEntry.taskId,
          description: timeEntry.description,
          startTime: timeEntry.startTime,
          endTime: timeEntry.endTime,
          durationSeconds: timeEntry.durationSeconds,
          scope: timeEntry.scope as "in_scope" | "out_of_scope",
          isManual: timeEntry.isManual,
          createdAt: timeEntry.createdAt,
        },
        workspaceId,
      );
    }

    if (timer.tenantId) {
      await storage.deleteActiveTimerWithTenant(timer.id, timer.tenantId);
    } else {
      await storage.deleteActiveTimer(timer.id);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Deleted legacy timer without tenantId");
        logTenancyWarning("timer/stop", "Deleted legacy timer without tenantId", userId);
      }
    }

    emitTimerStopped(timer.id, userId, timeEntryId, workspaceId);

    res.json({
      success: true,
      timeEntryId,
      discarded: discard || finalElapsedSeconds === 0,
      durationSeconds: finalElapsedSeconds,
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/stop", req);
  }
});

router.delete("/timer/current", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/delete", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) throw AppError.notFound("No active timer found");

    if (timer.tenantId) {
      await storage.deleteActiveTimerWithTenant(timer.id, timer.tenantId);
    } else {
      await storage.deleteActiveTimer(timer.id);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Deleted legacy timer without tenantId");
        logTenancyWarning("timer/delete", "Deleted legacy timer without tenantId", userId);
      }
    }

    emitTimerStopped(timer.id, userId, null, getCurrentWorkspaceId(req));

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/timer/current", req);
  }
});

export default router;
