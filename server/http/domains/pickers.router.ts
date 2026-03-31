import { Request, Response } from "express";
import { createApiRouter } from "../routerFactory";
import { db } from "../../db";
import { clients, projects, tasks } from "@shared/schema";
import { eq, and, ne, ilike, asc, SQL } from "drizzle-orm";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId } from "../../routes/helpers";
import { handleRouteError } from "../../lib/errors";
import { projectVisibilityFilter, taskVisibilityFilter } from "../../lib/privateVisibility";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

router.get("/v1/pickers/clients", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const rows = await db.select({
      id: clients.id,
      label: clients.companyName,
      displayName: clients.displayName,
    })
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(asc(clients.companyName));

    const result = rows.map(r => ({
      id: r.id,
      label: r.displayName || r.label,
    }));
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/pickers/clients", req);
  }
});

router.get("/v1/pickers/projects", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const { clientId, search } = req.query as Record<string, string | undefined>;

    const conditions: SQL[] = [
      eq(projects.tenantId, tenantId),
      ne(projects.status, "archived"),
      projectVisibilityFilter(userId, tenantId),
    ];
    if (clientId) conditions.push(eq(projects.clientId, clientId));
    if (search) conditions.push(ilike(projects.name, `%${search}%`));

    const rows = await db.select({
      id: projects.id,
      label: projects.name,
      clientId: projects.clientId,
    })
      .from(projects)
      .where(and(...conditions))
      .orderBy(asc(projects.name));

    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/pickers/projects", req);
  }
});

router.get("/v1/pickers/tasks", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const { projectId, search } = req.query as Record<string, string | undefined>;
    if (!projectId) return res.json([]);

    const conditions: SQL[] = [
      eq(tasks.tenantId, tenantId),
      eq(tasks.projectId, projectId),
      ne(tasks.status, "done"),
      taskVisibilityFilter(userId, tenantId),
    ];
    if (search) conditions.push(ilike(tasks.title, `%${search}%`));

    const rows = await db.select({
      id: tasks.id,
      label: tasks.title,
      projectId: tasks.projectId,
      parentTaskId: tasks.parentTaskId,
      status: tasks.status,
    })
      .from(tasks)
      .where(and(...conditions))
      .orderBy(asc(tasks.title));

    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/pickers/tasks", req);
  }
});

export default router;
