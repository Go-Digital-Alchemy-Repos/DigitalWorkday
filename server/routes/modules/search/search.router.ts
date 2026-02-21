/**
 * Search Router
 * 
 * Global search endpoint for command palette and quick navigation.
 * Provides tenant-scoped search across clients, projects, and tasks.
 * Also provides client-scoped search for the client command palette.
 */
import { createApiRouter } from '../../../http/routerFactory';
import { storage } from '../../../storage';
import { AppError, handleRouteError, sendError } from '../../../lib/errors';
import { getEffectiveTenantId, getCurrentWorkspaceIdAsync } from '../../helpers';

export const searchRouter = createApiRouter({ policy: "authTenant" });

/**
 * Global Search Endpoint for Command Palette
 * 
 * Provides tenant-scoped search across clients, projects, and tasks.
 * Used by the command palette (⌘K/Ctrl+K) for quick navigation.
 * 
 * Security:
 * - REQUIRES tenant context (returns 403 if missing)
 * - Uses only tenant-scoped storage methods (no fallbacks)
 * - Tasks fetched via project ownership (inherently tenant-scoped)
 * 
 * Performance:
 * - Parallel fetches for clients and projects
 * - Single batch query for tasks (getTasksByProjectIds)
 * - In-memory filtering with simple scoring (startsWith = 2, includes = 1)
 * - Results limited to maxResults (default 10, max 50)
 * 
 * @query q - Search query string (min 2 chars for results)
 * @query limit - Max results per category (default 10, max 50)
 * @returns { clients, projects, tasks } - Matching items with id, name, type
 */
searchRouter.get("/search", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return sendError(res, AppError.forbidden("Tenant context required for search"), req);
    }

    const { q, limit = "10" } = req.query;
    const searchQuery = String(q || "").trim().toLowerCase();
    const maxResults = Math.min(parseInt(String(limit), 10) || 10, 50);
    
    if (!searchQuery) {
      return res.json({ clients: [], projects: [], tasks: [] });
    }

    const workspaceId = await getCurrentWorkspaceIdAsync(req);

    const [clientsList, projectsList] = await Promise.all([
      storage.getClientsByTenant(tenantId, workspaceId),
      storage.getProjectsByTenant(tenantId, workspaceId),
    ]);

    const projectIds = projectsList.map(p => p.id);
    let tasksList: Array<{ id: string; title: string; projectId: string | null; status: string | null; tenantId: string | null }> = [];
    
    if (projectIds.length > 0) {
      const taskMap = await storage.getTasksByProjectIds(projectIds);
      for (const tasks of taskMap.values()) {
        tasksList.push(...tasks.map(t => ({
          id: t.id,
          title: t.title || "",
          projectId: t.projectId,
          status: t.status,
          tenantId: tenantId,
        })));
      }
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

    const clients = filterAndScore(clientsList, c => c.companyName);
    const projects = filterAndScore(projectsList, p => p.name);
    const filteredTasks = filterAndScore(tasksList, t => t.title);

    res.json({ 
      clients: clients.map(c => ({ id: c.id, name: c.companyName, type: "client" })),
      projects: projects.map(p => ({ id: p.id, name: p.name, type: "project", status: p.status })),
      tasks: filteredTasks.map(t => ({ id: t.id, name: t.title, type: "task", projectId: t.projectId, status: t.status })),
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

    const clientProjects = await storage.getProjectsByClient(clientId);
    const tenantProjects = clientProjects.filter(p => p.tenantId === tenantId);

    if (tenantProjects.length === 0 && searchQuery.length < 2) {
      return res.json({ projects: [], tasks: [] });
    }

    const projectIds = tenantProjects.map(p => p.id);
    let tasksList: Array<{ id: string; title: string; projectId: string | null; status: string | null }> = [];

    if (projectIds.length > 0) {
      const taskMap = await storage.getTasksByProjectIds(projectIds);
      for (const tasks of taskMap.values()) {
        tasksList.push(...tasks.map(t => ({
          id: t.id,
          title: t.title || "",
          projectId: t.projectId,
          status: t.status,
        })));
      }
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
