import { Router } from "express";
import { z } from "zod";
import { config } from "../../config";
import { storage } from "../../storage";
import { hasTenantAdminAccess } from "@shared/roles";
import { desktopBootstrapSchema, desktopTaskDetailSchema, desktopTaskPageSchema } from "@shared/desktopContracts";
import { getTasksByUserBatched } from "../../http/services/taskBatchHydrator";
import { desktopIdempotencyMiddleware } from "./desktopIdempotency.middleware";
import { toDesktopComment, toDesktopProject, toDesktopTask, toDesktopTaskPage, toDesktopTimer } from "./desktopContracts";
import { canViewTask } from "../../lib/privateVisibility";
import { listDesktopSessions, revokeDesktopSessionById } from "./desktopAuth.service";
import tasksRouter from "../../http/domains/tasks.router";
import commentsRouter from "../../http/domains/comments.router";
import subtasksRouter from "../../http/domains/subtasks.router";
import timeRouter from "../../http/domains/time.router";

const router = Router();

router.use((req, res, next) => {
  if (!config.features.enableDesktopApi) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!req.desktopAuth || !req.user) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Desktop bearer token required",
        status: 401,
        requestId: req.requestId || "unknown",
      },
    });
    return;
  }
  next();
});

router.use(desktopIdempotencyMiddleware);

router.get("/auth/sessions", async (req, res, next) => {
  try { res.json(await listDesktopSessions(req.user!.id)); } catch (error) { next(error); }
});

router.post("/auth/sessions/:id/revoke", async (req, res, next) => {
  try {
    const revoked = await revokeDesktopSessionById(req.params.id, req.user!.id);
    if (!revoked) { res.status(404).json({ error: "Desktop session not found" }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

const taskPageQuerySchema = z.object({
  status: z.enum(["open", "done", "all"]).default("open"),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

function cursorOffset(cursor?: string): number {
  if (!cursor) return 0;
  const value = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function loadDesktopData(req: import("express").Request) {
  const auth = req.desktopAuth!;
  const user = req.user!;
  const workspace = await storage.getWorkspace(auth.workspaceId);
  if (!workspace || workspace.tenantId !== auth.tenantId) throw new Error("Desktop workspace is unavailable");

  const [tasks, projects, timer] = await Promise.all([
    getTasksByUserBatched(user.id, auth.tenantId),
    storage.getProjectsForUser(
      user.id,
      auth.tenantId,
      auth.workspaceId,
      hasTenantAdminAccess(user.role),
    ),
    storage.getActiveTimerByUserAndTenant(user.id, auth.tenantId),
  ]);
  const clientIds = Array.from(new Set(projects.map((project) => project.clientId).filter((id): id is string => Boolean(id))));
  const clients = clientIds.length ? await storage.getClientsByIds(clientIds) : [];
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  return { workspace, tasks, projects, clients, clientsById, timer };
}

router.get("/bootstrap", async (req, res, next) => {
  try {
    const data = await loadDesktopData(req);
    const openTasks = data.tasks.filter((task) => task.status !== "done");
    const user = req.user!;
    const response = desktopBootstrapSchema.parse({
      contractVersion: 1,
      serverTime: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name ?? null,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
      },
      workspace: { id: data.workspace.id, name: data.workspace.name },
      projects: data.projects.map((project) => toDesktopProject(project, project.clientId ? data.clientsById.get(project.clientId) : undefined)),
      clients: data.clients.map((client) => ({ id: client.id, companyName: client.companyName })),
      tasks: toDesktopTaskPage(openTasks, data.clientsById, 0, 100),
      activeTimer: toDesktopTimer(data.timer),
    });
    res.set("Cache-Control", "private, no-store");
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/page", async (req, res, next) => {
  const parsed = taskPageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid task page query" });
    return;
  }
  try {
    const data = await loadDesktopData(req);
    const filtered = data.tasks.filter((task) => {
      if (parsed.data.status === "all") return true;
      return parsed.data.status === "done" ? task.status === "done" : task.status !== "done";
    });
    res.json(desktopTaskPageSchema.parse(toDesktopTaskPage(
      filtered,
      data.clientsById,
      cursorOffset(parsed.data.cursor),
      parsed.data.limit,
    )));
  } catch (error) {
    next(error);
  }
});

router.get("/task-details/:id", async (req, res, next) => {
  try {
    const auth = req.desktopAuth!;
    if (!(await canViewTask(auth.tenantId, req.params.id, req.user!.id))) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const [task, comments] = await Promise.all([
      storage.getTaskWithRelations(req.params.id),
      storage.getCommentsByTask(req.params.id),
    ]);
    if (!task || task.tenantId !== auth.tenantId) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const clients = task.project?.clientId ? await storage.getClientsByIds([task.project.clientId]) : [];
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    res.json(desktopTaskDetailSchema.parse({
      task: toDesktopTask(task, clientsById),
      comments: comments.map(toDesktopComment),
    }));
  } catch (error) {
    next(error);
  }
});

// Mount the existing domain handlers under the versioned desktop namespace so
// task completion, notifications, automations, comments and time tracking keep
// exactly the same server-side semantics as the web client.
router.use(tasksRouter);
router.use(commentsRouter);
router.use(subtasksRouter);
router.use(timeRouter);

export default router;
