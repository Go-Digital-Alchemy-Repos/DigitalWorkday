import { Router } from "express";
import {
  storage,
  handleRouteError,
  getEffectiveTenantId,
  isStrictMode,
  isSoftMode,
  getCurrentUserId,
  getCurrentWorkspaceId,
} from "./shared";
import { config } from "../../../config";
import { getAccessiblePrivateTaskIds, getAccessiblePrivateProjectIds } from "../../../lib/privateVisibility";

const router = Router();

router.get("/calendar/events", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { start, end } = req.query;

    const startDate = start ? new Date(start as string) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = end ? new Date(end as string) : new Date(new Date().setDate(new Date().getDate() + 30));

    let tasksInRange;
    if (tenantId && isStrictMode()) {
      tasksInRange = await storage.getCalendarTasksByTenant(tenantId, workspaceId, startDate, endDate);
    } else {
      tasksInRange = await storage.getCalendarTasksByWorkspace(workspaceId, startDate, endDate);
    }

    const timeFilters = {
      startDate,
      endDate,
    };

    let timeEntries;
    if (tenantId && isStrictMode()) {
      timeEntries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, timeFilters);
    } else {
      timeEntries = await storage.getTimeEntriesByWorkspace(workspaceId, timeFilters);
    }

    let clients;
    let projects;
    if (tenantId && isStrictMode()) {
      clients = await storage.getClientsByTenant(tenantId, workspaceId);
      projects = await storage.getProjectsByTenant(tenantId, workspaceId);
    } else {
      clients = await storage.getClientsByWorkspace(workspaceId);
      projects = await storage.getProjectsByWorkspace(workspaceId);
    }

    let users;
    if (tenantId) {
      users = await storage.getUsersByTenant(tenantId);
    } else {
      users = await storage.getUsersByWorkspace(workspaceId);
    }

    let filteredTasks = tasksInRange;
    let filteredProjects = projects;
    const userId = getCurrentUserId(req);
    if (tenantId && config.features.enablePrivateTasks) {
      const accessibleTaskIds = await getAccessiblePrivateTaskIds(userId, tenantId);
      const accessibleTaskSet = new Set(accessibleTaskIds);
      filteredTasks = tasksInRange.filter((t: any) =>
        t.visibility !== 'private' || accessibleTaskSet.has(t.id)
      );
    }
    if (tenantId && config.features.enablePrivateProjects) {
      const accessibleProjectIds = await getAccessiblePrivateProjectIds(userId, tenantId);
      const accessibleProjectSet = new Set(accessibleProjectIds);
      filteredProjects = projects.filter((p: any) =>
        p.visibility !== 'private' || accessibleProjectSet.has(p.id)
      );
    }

    res.json({
      tasks: filteredTasks,
      timeEntries,
      clients,
      projects: filteredProjects,
      users: users || [],
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/calendar/events", req);
  }
});

router.get("/my-calendar/events", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { start, end } = req.query;

    const startDate = start ? new Date(start as string) : new Date(new Date().setDate(new Date().getDate() - 7));
    const endDate = end ? new Date(end as string) : new Date(new Date().setDate(new Date().getDate() + 30));

    let tasks;
    if (tenantId && isStrictMode()) {
      tasks = await storage.getCalendarTasksByTenant(tenantId, workspaceId, startDate, endDate);
    } else {
      tasks = await storage.getCalendarTasksByWorkspace(workspaceId, startDate, endDate);
    }
    
    let userTasks = tasks.filter(task => 
      task.assignees?.some(a => a.userId === userId)
    );

    if (tenantId && config.features.enablePrivateTasks) {
      const accessibleTaskIds = await getAccessiblePrivateTaskIds(userId, tenantId);
      const accessibleTaskSet = new Set(accessibleTaskIds);
      userTasks = userTasks.filter((t: any) =>
        t.visibility !== 'private' || accessibleTaskSet.has(t.id)
      );
    }

    const allUserTasks = await storage.getTasksByUser(userId);
    const personalTasks = allUserTasks
      .filter(t => t.isPersonal && t.dueDate)
      .filter(t => {
        const dueDate = new Date(t.dueDate!);
        return dueDate >= startDate && dueDate <= endDate;
      })
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        projectId: t.projectId,
        isPersonal: true,
        assignees: [],
      }));

    let timeEntries;
    if (tenantId && isStrictMode()) {
      timeEntries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { 
        userId, 
        startDate, 
        endDate 
      });
    } else {
      const allUserEntries = await storage.getTimeEntriesByUser(userId, workspaceId);
      timeEntries = allUserEntries.filter(entry => {
        const entryDate = new Date(entry.startTime);
        return entryDate >= startDate && entryDate <= endDate;
      });
    }

    res.json({
      tasks: userTasks,
      personalTasks,
      timeEntries,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/my-calendar/events", req);
  }
});

export default router;
