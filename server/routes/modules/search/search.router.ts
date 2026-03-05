/**
 * Search Router
 * 
 * Global search endpoint for command palette and quick navigation.
 * SQL-first search with tenant scoping, visibility filters, and trigram indexes.
 * Also provides client-scoped search for the client command palette.
 */
import { createApiRouter } from '../../../http/routerFactory';
import { storage } from '../../../storage';
import { AppError, handleRouteError, sendError } from '../../../lib/errors';
import { getEffectiveTenantId, getCurrentWorkspaceIdAsync, getCurrentUserId } from '../../helpers';
import { config } from '../../../config';
import { getAccessiblePrivateProjectIds, getAccessiblePrivateTaskIds } from '../../../lib/privateVisibility';
import { db } from '../../../db';
import { searchTenantEntities } from '../../../services/search/globalSearchService';

export const searchRouter = createApiRouter({ policy: "authTenant" });

const SLOW_SEARCH_THRESHOLD_MS = 500;

searchRouter.get("/search", async (req, res) => {
  const searchStart = performance.now();
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return sendError(res, AppError.forbidden("Tenant context required for search"), req);
    }

    const { q, limit = "10" } = req.query;
    const searchQuery = String(q || "").trim();
    const maxResults = Math.min(parseInt(String(limit), 10) || 10, 50);
    
    if (!searchQuery || searchQuery.length < 2) {
      return res.json({ clients: [], projects: [], tasks: [], users: [], teams: [], comments: [] });
    }

    const userId = getCurrentUserId(req);

    const results = await searchTenantEntities({
      tenantId,
      userId,
      query: searchQuery,
      maxResults,
    });

    const durationMs = Math.round(performance.now() - searchStart);

    res.set("X-Search-Duration", String(durationMs));

    if (durationMs > SLOW_SEARCH_THRESHOLD_MS) {
      console.warn(`[search] Slow search: q="${searchQuery.substring(0, 30)}" tenant=${tenantId.substring(0, 8)} duration=${durationMs}ms counts=${JSON.stringify(Object.fromEntries(Object.entries(results).filter(([k]) => k !== "timing").map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])))}`);
    } else if (Math.random() < 0.1) {
      console.log(`[search] q="${searchQuery.substring(0, 20)}" duration=${durationMs}ms timing=${JSON.stringify(results.timing.perEntity)}`);
    }

    res.json({ 
      clients: results.clients.map(r => ({ id: r.id, name: r.title, type: "client" })),
      projects: results.projects.map(r => ({ id: r.id, name: r.title, type: "project", status: r.meta.status })),
      tasks: results.tasks.map(r => ({ id: r.id, name: r.title, type: "task", projectId: r.meta.projectId, status: r.meta.status })),
      users: results.users.map(r => ({
        id: r.id,
        name: r.title,
        email: r.meta.email,
        type: "user",
        role: r.meta.role,
      })),
      teams: results.teams.map(r => ({ id: r.id, name: r.title, type: "team" })),
      comments: results.comments.map(r => ({
        id: r.id,
        name: r.title,
        type: "comment",
        taskId: r.meta.taskId,
        projectId: r.meta.projectId,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/search", req);
  }
});

searchRouter.get("/clients/:clientId/search", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return sendError(res, AppError.forbidden("Tenant context required for search"), req);
    }

    const { clientId } = req.params;
    const { q, limit = "15" } = req.query;
    const searchQuery = String(q || "").trim().toLowerCase();
    const maxResults = Math.min(parseInt(String(limit), 10) || 15, 50);

    const userId = getCurrentUserId(req);

    const clientProjects = await storage.getProjectsByClient(clientId);
    let tenantProjects = clientProjects.filter(p => p.tenantId === tenantId);

    if (config.features.enablePrivateProjects) {
      const accessibleProjectIds = await getAccessiblePrivateProjectIds(userId, tenantId);
      const accessibleProjectSet = new Set(accessibleProjectIds);
      tenantProjects = tenantProjects.filter(p =>
        (p as any).visibility !== 'private' || accessibleProjectSet.has(p.id)
      );
    }

    if (tenantProjects.length === 0 && searchQuery.length < 2) {
      return res.json({ projects: [], tasks: [] });
    }

    const projectIds = tenantProjects.map(p => p.id);
    let tasksList: Array<{ id: string; title: string; projectId: string | null; status: string | null; visibility?: string }> = [];

    if (projectIds.length > 0) {
      const taskMap = await storage.getTasksByProjectIds(projectIds);
      for (const tasks of taskMap.values()) {
        tasksList.push(...tasks.map(t => ({
          id: t.id,
          title: t.title || "",
          projectId: t.projectId,
          status: t.status,
          visibility: (t as any).visibility || 'workspace',
        })));
      }
    }

    if (config.features.enablePrivateTasks) {
      const accessibleTaskIds = await getAccessiblePrivateTaskIds(userId, tenantId);
      const accessibleTaskSet = new Set(accessibleTaskIds);
      tasksList = tasksList.filter(t =>
        t.visibility !== 'private' || accessibleTaskSet.has(t.id)
      );
    }

    if (!searchQuery || searchQuery.length < 2) {
      return res.json({
        projects: tenantProjects.slice(0, maxResults).map(p => ({
          id: p.id, name: p.name, type: "project", status: p.status,
        })),
        tasks: tasksList.slice(0, maxResults).map(t => ({
          id: t.id, name: t.title, type: "task", projectId: t.projectId, status: t.status,
        })),
      });
    }

    const filterAndScore = <T extends { id: string }>(
      items: T[],
      getSearchText: (item: T) => string
    ) => {
      return items
        .map(item => {
          const text = getSearchText(item).toLowerCase();
          if (!text.includes(searchQuery)) return null;
          const score = text.startsWith(searchQuery) ? 2 : 1;
          return { item, score };
        })
        .filter((r): r is { item: T; score: number } => r !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map(r => r.item);
    };

    const projects = filterAndScore(tenantProjects, p => p.name);
    const filteredTasks = filterAndScore(tasksList, t => t.title);

    res.json({
      projects: projects.map(p => ({ id: p.id, name: p.name, type: "project", status: p.status })),
      tasks: filteredTasks.map(t => ({ id: t.id, name: t.title, type: "task", projectId: t.projectId, status: t.status })),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/search", req);
  }
});
