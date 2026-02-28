/**
 * Search Router
 * 
 * Global search endpoint for command palette and quick navigation.
 * Provides tenant-scoped search across clients, projects, tasks,
 * users, teams, and client notes.
 * Also provides client-scoped search for the client command palette.
 */
import { createApiRouter } from '../../../http/routerFactory';
import { storage } from '../../../storage';
import { AppError, handleRouteError, sendError } from '../../../lib/errors';
import { getEffectiveTenantId, getCurrentWorkspaceIdAsync, getCurrentUserId } from '../../helpers';
import { config } from '../../../config';
import { getAccessiblePrivateProjectIds, getAccessiblePrivateTaskIds } from '../../../lib/privateVisibility';
import { db } from '../../../db';
import { comments, tasks } from '@shared/schema';
import { eq, ilike, and, inArray } from 'drizzle-orm';

export const searchRouter = createApiRouter({ policy: "authTenant" });

searchRouter.get("/search", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return sendError(res, AppError.forbidden("Tenant context required for search"), req);
    }

    const { q, limit = "10" } = req.query;
    const searchQuery = String(q || "").trim().toLowerCase();
    const maxResults = Math.min(parseInt(String(limit), 10) || 10, 50);
    
    if (!searchQuery || searchQuery.length < 2) {
      return res.json({ clients: [], projects: [], tasks: [], users: [], teams: [], comments: [] });
    }

    const workspaceId = await getCurrentWorkspaceIdAsync(req);
    const userId = getCurrentUserId(req);

    const [clientsList, projectsList, tenantUsers, tenantTeams] = await Promise.all([
      storage.getClientsByTenant(tenantId, workspaceId),
      storage.getProjectsByTenant(tenantId, workspaceId),
      storage.getUsersByTenant(tenantId),
      storage.getTeamsByTenant(tenantId, workspaceId),
    ]);

    let filteredProjectsList = projectsList;
    if (config.features.enablePrivateProjects) {
      const accessibleProjectIds = await getAccessiblePrivateProjectIds(userId, tenantId);
      const accessibleProjectSet = new Set(accessibleProjectIds);
      filteredProjectsList = projectsList.filter(p =>
        (p as any).visibility !== 'private' || accessibleProjectSet.has(p.id)
      );
    }

    const projectIds = filteredProjectsList.map(p => p.id);
    let tasksList: Array<{ id: string; title: string; projectId: string | null; status: string | null; tenantId: string | null; visibility?: string }> = [];
    
    if (projectIds.length > 0) {
      const taskMap = await storage.getTasksByProjectIds(projectIds);
      for (const tasks of taskMap.values()) {
        tasksList.push(...tasks.map(t => ({
          id: t.id,
          title: t.title || "",
          projectId: t.projectId,
          status: t.status,
          tenantId: tenantId,
          visibility: (t as any).visibility || 'workspace',
        })));
      }
    }

    if (config.features.enablePrivateTasks) {
      const privateAccessibleTaskIds = await getAccessiblePrivateTaskIds(userId, tenantId);
      const accessibleTaskSet = new Set(privateAccessibleTaskIds);
      tasksList = tasksList.filter(t =>
        t.visibility !== 'private' || accessibleTaskSet.has(t.id)
      );
    }

    const visibleTaskIds = tasksList.map(t => t.id);
    let commentResults: Array<{ id: string; body: string; taskId: string | null }> = [];
    if (visibleTaskIds.length > 0) {
      commentResults = await db.select({
        id: comments.id,
        body: comments.body,
        taskId: comments.taskId,
      })
        .from(comments)
        .where(and(
          inArray(comments.taskId, visibleTaskIds),
          ilike(comments.body, `%${searchQuery}%`)
        ))
        .limit(maxResults);
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
    const projects = filterAndScore(filteredProjectsList, p => p.name);
    const filteredTasks = filterAndScore(tasksList, t => t.title);
    const filteredUsers = filterAndScore(tenantUsers, u => {
      const parts = [u.firstName, u.lastName, u.email].filter(Boolean);
      return parts.join(" ");
    });
    const filteredTeams = filterAndScore(tenantTeams, t => t.name);

    const taskIdToProjectId = new Map(tasksList.map(t => [t.id, t.projectId]));

    res.json({ 
      clients: clients.map(c => ({ id: c.id, name: c.companyName, type: "client" })),
      projects: projects.map(p => ({ id: p.id, name: p.name, type: "project", status: p.status })),
      tasks: filteredTasks.map(t => ({ id: t.id, name: t.title, type: "task", projectId: t.projectId, status: t.status })),
      users: filteredUsers.map(u => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        email: u.email,
        type: "user",
        role: u.role,
      })),
      teams: filteredTeams.map(t => ({ id: t.id, name: t.name, type: "team" })),
      comments: commentResults.map(c => {
        const plainBody = (c.body || "").replace(/<[^>]*>/g, "").slice(0, 80);
        return {
          id: c.id,
          name: plainBody + (plainBody.length >= 80 ? "..." : ""),
          type: "comment",
          taskId: c.taskId,
          projectId: taskIdToProjectId.get(c.taskId || "") || null,
        };
      }),
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
