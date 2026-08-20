import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { config } from "../../config";
import { storage } from "../../storage";
import { hasTenantAdminAccess } from "@shared/roles";
import { desktopBootstrapSchema, desktopNotificationPageSchema, desktopProfileUpdateSchema, desktopTaskDetailSchema, desktopTaskPageSchema, desktopTodaySchema, desktopUserSchema } from "@shared/desktopContracts";
import { getTasksByUserBatched } from "../../http/services/taskBatchHydrator";
import { desktopIdempotencyMiddleware } from "./desktopIdempotency.middleware";
import { toDesktopComment, toDesktopProject, toDesktopTask, toDesktopTaskPage, toDesktopTimer, toDesktopUser } from "./desktopContracts";
import { canViewTask } from "../../lib/privateVisibility";
import { listDesktopSessions, revokeDesktopSessionById } from "./desktopAuth.service";
import tasksRouter from "../../http/domains/tasks.router";
import commentsRouter from "../../http/domains/comments.router";
import subtasksRouter from "../../http/domains/subtasks.router";
import timeRouter from "../../http/domains/time.router";
import { deleteFromStorageByUrl } from "../../services/uploads/s3UploadService";
import { generateAvatarKey, isS3Configured, uploadToS3, validateAvatar } from "../../s3";
import { AppError } from "../../lib/errors";

const router = Router();
const desktopAvatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

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

router.patch("/profile", async (req, res, next) => {
  const parsed = desktopProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "First and last name are required" });
    return;
  }
  try {
    const current = await storage.getUserByIdAndTenant(req.user!.id, req.desktopAuth!.tenantId);
    if (!current) throw AppError.notFound("User");
    const updated = await storage.updateUser(current.id, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      name: `${parsed.data.firstName} ${parsed.data.lastName}`,
    });
    if (!updated) throw AppError.notFound("User");
    res.set("Cache-Control", "private, no-store");
    res.json(desktopUserSchema.parse(toDesktopUser(updated)));
  } catch (error) {
    next(error);
  }
});

router.post("/profile/avatar", desktopAvatarUpload.single("file"), async (req, res, next) => {
  try {
    if (!isS3Configured()) throw AppError.internal("Avatar storage is unavailable");
    if (!req.file) throw AppError.badRequest("No image selected");
    const validation = validateAvatar(req.file.mimetype, req.file.size);
    if (!validation.valid) throw AppError.badRequest(validation.error || "Invalid avatar image");

    const current = await storage.getUserByIdAndTenant(req.user!.id, req.desktopAuth!.tenantId);
    if (!current) throw AppError.notFound("User");
    const storageKey = generateAvatarKey(req.desktopAuth!.tenantId, current.id, req.file.originalname);
    const avatarUrl = await uploadToS3(req.file.buffer, storageKey, req.file.mimetype);
    const updated = await storage.updateUser(current.id, { avatarUrl });
    if (!updated) throw AppError.notFound("User");
    if (current.avatarUrl && current.avatarUrl !== avatarUrl) {
      void deleteFromStorageByUrl(current.avatarUrl, req.desktopAuth!.tenantId).catch(() => undefined);
    }
    res.set("Cache-Control", "private, no-store");
    res.json(desktopUserSchema.parse(toDesktopUser(updated)));
  } catch (error) {
    next(error);
  }
});

router.delete("/profile/avatar", async (req, res, next) => {
  try {
    const current = await storage.getUserByIdAndTenant(req.user!.id, req.desktopAuth!.tenantId);
    if (!current) throw AppError.notFound("User");
    const updated = await storage.updateUser(current.id, { avatarUrl: null });
    if (!updated) throw AppError.notFound("User");
    if (current.avatarUrl) {
      void deleteFromStorageByUrl(current.avatarUrl, req.desktopAuth!.tenantId).catch(() => undefined);
    }
    res.set("Cache-Control", "private, no-store");
    res.json(desktopUserSchema.parse(toDesktopUser(updated)));
  } catch (error) {
    next(error);
  }
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

  const [tasks, projects, timer, memberships] = await Promise.all([
    getTasksByUserBatched(user.id, auth.tenantId),
    storage.getProjectsForUser(
      user.id,
      auth.tenantId,
      auth.workspaceId,
      hasTenantAdminAccess(user.role),
    ),
    storage.getActiveTimerByUserAndTenant(user.id, auth.tenantId),
    storage.getWorkspaceMembers(auth.workspaceId),
  ]);
  const clientIds = Array.from(new Set(projects.map((project) => project.clientId).filter((id): id is string => Boolean(id))));
  const clients = clientIds.length ? await storage.getClientsByIds(clientIds) : [];
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const members = memberships
    .filter((member) => member.status === "active" && member.user?.isActive !== false)
    .flatMap((member) => member.user ? [{
      id: member.user.id,
      name: member.user.name ?? null,
      email: member.user.email,
      role: member.user.role,
      avatarUrl: member.user.avatarUrl ?? null,
    }] : []);
  return { workspace, tasks, projects, clients, clientsById, timer, members };
}

router.get("/bootstrap", async (req, res, next) => {
  try {
    const data = await loadDesktopData(req);
    const openTasks = data.tasks.filter((task) => task.status !== "done");
    const user = req.user!;
    const response = desktopBootstrapSchema.parse({
      contractVersion: 1,
      serverTime: new Date().toISOString(),
      user: toDesktopUser(user),
      workspace: { id: data.workspace.id, name: data.workspace.name },
      projects: data.projects.map((project) => toDesktopProject(project, project.clientId ? data.clientsById.get(project.clientId) : undefined)),
      clients: data.clients.map((client) => ({ id: client.id, companyName: client.companyName })),
      members: data.members,
      tasks: toDesktopTaskPage(openTasks, data.clientsById, 0, 100),
      activeTimer: toDesktopTimer(data.timer),
    });
    res.set("Cache-Control", "private, no-store");
    res.json(response);
  } catch (error) {
    next(error);
  }
});

const desktopRangeSchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

router.get("/today", async (req, res, next) => {
  const parsed = desktopRangeSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "A valid start and end are required" }); return; }
  try {
    const data = await loadDesktopData(req);
    const start = new Date(parsed.data.start);
    const end = new Date(parsed.data.end);
    const open = data.tasks.filter((task) => task.status !== "done" && task.dueDate);
    const overdue = open.filter((task) => new Date(task.dueDate!).getTime() < start.getTime());
    const today = open.filter((task) => {
      const due = new Date(task.dueDate!).getTime();
      return due >= start.getTime() && due < end.getTime();
    });
    const entries = await storage.getTimeEntriesByUser(req.user!.id, req.desktopAuth!.workspaceId);
    const trackedSeconds = entries.reduce((total, entry) => {
      const value = new Date(entry.startTime).getTime();
      return value >= start.getTime() && value < end.getTime() ? total + Math.max(0, entry.durationSeconds ?? 0) : total;
    }, 0);
    res.json(desktopTodaySchema.parse({
      start: start.toISOString(), end: end.toISOString(),
      overdue: overdue.map((task) => toDesktopTask(task, data.clientsById)),
      today: today.map((task) => toDesktopTask(task, data.clientsById)),
      agenda: today.map((task) => toDesktopTask(task, data.clientsById)),
      trackedSeconds,
    }));
  } catch (error) { next(error); }
});

const desktopNotificationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unreadOnly: z.enum(["true", "false"]).optional(),
});

router.get("/notifications", async (req, res, next) => {
  const parsed = desktopNotificationQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid notification query" }); return; }
  try {
    const auth = req.desktopAuth!;
    const [page, unreadCount] = await Promise.all([
      storage.getNotificationsByUserPaginated(req.user!.id, auth.tenantId, {
        cursor: parsed.data.cursor, limit: parsed.data.limit, unreadOnly: parsed.data.unreadOnly === "true",
      }),
      storage.getUnreadNotificationCount(req.user!.id, auth.tenantId),
    ]);
    res.json(desktopNotificationPageSchema.parse({ items: page.items, nextCursor: page.nextCursor, unreadCount }));
  } catch (error) { next(error); }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const value = await storage.markNotificationRead(req.params.id, req.user!.id, req.desktopAuth!.tenantId);
    if (!value) { res.status(404).json({ error: "Notification not found" }); return; }
    res.json(value);
  } catch (error) { next(error); }
});

router.patch("/notifications/:id/dismiss", async (req, res, next) => {
  try {
    const value = await storage.dismissNotification(req.params.id, req.user!.id, req.desktopAuth!.tenantId);
    if (!value) { res.status(404).json({ error: "Notification not found" }); return; }
    res.json(value);
  } catch (error) { next(error); }
});

router.post("/notifications/mark-all-read", async (req, res, next) => {
  try { await storage.markAllNotificationsRead(req.user!.id, req.desktopAuth!.tenantId); res.json({ success: true }); }
  catch (error) { next(error); }
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

// A desktop task may only be moved into a project already present in that
// user's authorized bootstrap payload. Client context continues to come from
// the selected project rather than being accepted from the client.
router.patch("/tasks/:id", async (req, res, next) => {
  const projectId = req.body?.projectId;
  if (projectId === undefined || projectId === null) { next(); return; }
  if (typeof projectId !== "string") {
    res.status(400).json({ error: "Invalid project" });
    return;
  }
  try {
    const auth = req.desktopAuth!;
    const projects = await storage.getProjectsForUser(
      req.user!.id,
      auth.tenantId,
      auth.workspaceId,
      hasTenantAdminAccess(req.user!.role),
    );
    if (!projects.some((project) => project.id === projectId)) {
      res.status(403).json({ error: "Project is not available to this desktop session" });
      return;
    }
    next();
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
