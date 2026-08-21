import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { config } from "../../config";
import { storage } from "../../storage";
import { hasTenantAdminAccess } from "@shared/roles";
import { desktopBootstrapSchema, desktopCommandCenterSchema, desktopNotificationPageSchema, desktopProfileUpdateSchema, desktopTaskDetailSchema, desktopTaskPageSchema, desktopTodaySchema, desktopUserSchema } from "@shared/desktopContracts";
import { getTasksByUserBatched } from "../../http/services/taskBatchHydrator";
import { desktopIdempotencyMiddleware } from "./desktopIdempotency.middleware";
import { toDesktopComment, toDesktopProject, toDesktopTask, toDesktopTaskPage, toDesktopTimeEntry, toDesktopTimer, toDesktopUser } from "./desktopContracts";
import { trailingDateKeys, zonedDateKey, zonedDayRange } from "./desktopCommandCenter";
import { canViewTask } from "../../lib/privateVisibility";
import { listDesktopSessions, revokeDesktopSessionById } from "./desktopAuth.service";
import tasksRouter from "../../http/domains/tasks.router";
import commentsRouter from "../../http/domains/comments.router";
import subtasksRouter from "../../http/domains/subtasks.router";
import timeRouter from "../../http/domains/time.router";
import { deleteFromStorageByUrl } from "../../services/uploads/s3UploadService";
import { generateAvatarKey, isS3Configured, uploadToS3, validateAvatar } from "../../s3";
import { AppError } from "../../lib/errors";
import { friendlyMacDevice, heartbeatActivitySession } from "../activity/userActivitySession.service";
import { activityHeartbeatRateLimiter } from "../../middleware/rateLimit";

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

router.post("/activity/heartbeat", activityHeartbeatRateLimiter, async (req, res, next) => {
  const parsed = z.object({ state: z.enum(["active", "idle", "hidden"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid activity state" }); return; }
  try {
    const auth = req.desktopAuth!;
    await heartbeatActivitySession({
      userId: req.user!.id,
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      platform: "macos",
      deviceLabel: friendlyMacDevice(auth.deviceName),
      sourceSessionId: auth.sessionId,
    }, parsed.data.state);
    res.status(204).end();
  } catch (error) { next(error); }
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

  const [tasks, projects, timer, tenantUsers] = await Promise.all([
    getTasksByUserBatched(user.id, auth.tenantId),
    storage.getProjectsForUser(
      user.id,
      auth.tenantId,
      auth.workspaceId,
      hasTenantAdminAccess(user.role),
    ),
    storage.getActiveTimerByUserAndTenant(user.id, auth.tenantId),
    storage.getUsersByTenant(auth.tenantId),
  ]);
  const clientIds = Array.from(new Set(projects.map((project) => project.clientId).filter((id): id is string => Boolean(id))));
  const clients = clientIds.length ? await storage.getClientsByIds(clientIds) : [];
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const members = toDesktopMembers(tenantUsers);
  return { workspace, tasks, projects, clients, clientsById, timer, members };
}

type DesktopMemberSource = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
};

export function toDesktopMembers(users: DesktopMemberSource[]) {
  return users
    .filter((user) => user.isActive !== false)
    .map((user) => ({
      id: user.id,
      name: user.name ?? null,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
    }));
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

const commandCenterQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().trim().min(1).max(100),
});

router.get("/command-center", async (req, res, next) => {
  const parsed = commandCenterQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid date and time zone are required" });
    return;
  }
  try {
    const { date, timeZone } = parsed.data;
    let range: { start: Date; end: Date };
    try {
      range = zonedDayRange(date, timeZone);
    } catch {
      res.status(400).json({ error: "The requested time zone is invalid" });
      return;
    }

    const data = await loadDesktopData(req);
    const entries = await storage.getTimeEntriesByUser(req.user!.id, req.desktopAuth!.workspaceId);
    const open = data.tasks.filter((task) => task.status !== "done");
    const datedOpen = open.filter((task) => task.dueDate);
    const overdue = datedOpen.filter((task) => new Date(task.dueDate!).getTime() < range.start.getTime());
    const today = datedOpen.filter((task) => {
      const due = new Date(task.dueDate!).getTime();
      return due >= range.start.getTime() && due < range.end.getTime();
    });
    const upcoming = datedOpen.filter((task) => new Date(task.dueDate!).getTime() >= range.end.getTime());

    const dateKeys = trailingDateKeys(date, 7);
    const trackedByDate = new Map(dateKeys.map((key) => [key, 0]));
    for (const entry of entries) {
      const key = zonedDateKey(new Date(entry.startTime), timeZone);
      if (trackedByDate.has(key)) {
        trackedByDate.set(key, (trackedByDate.get(key) ?? 0) + Math.max(0, entry.durationSeconds ?? 0));
      }
    }
    const trackedDays = dateKeys.map((key) => ({ date: key, seconds: trackedByDate.get(key) ?? 0 }));

    const taskEvents = today.map((task) => {
      const start = new Date(task.dueDate!);
      const allDay = start.getUTCHours() === 0 && start.getUTCMinutes() === 0;
      return {
        id: `task:${task.id}`,
        kind: task.isPersonal ? "personal_task" as const : "task" as const,
        taskId: task.id,
        title: task.title,
        subtitle: task.project?.name ?? "Personal",
        start: start.toISOString(),
        end: null,
        allDay,
        durationSeconds: task.estimateMinutes ? task.estimateMinutes * 60 : null,
      };
    });
    const timeEvents = entries
      .filter((entry) => {
        const value = new Date(entry.startTime).getTime();
        return value >= range.start.getTime() && value < range.end.getTime();
      })
      .map((entry) => ({
        id: `time:${entry.id}`,
        kind: "time_entry" as const,
        taskId: entry.taskId ?? null,
        title: entry.title || entry.description || entry.task?.title || "Tracked work",
        subtitle: entry.project?.name ?? null,
        start: new Date(entry.startTime).toISOString(),
        end: entry.endTime ? new Date(entry.endTime).toISOString() : null,
        allDay: false,
        durationSeconds: Math.max(0, entry.durationSeconds ?? 0),
      }));
    const agenda = [...taskEvents, ...timeEvents].sort((left, right) => {
      if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
      return left.start.localeCompare(right.start);
    });

    const response = desktopCommandCenterSchema.parse({
      date,
      timeZone,
      workload: { overdue: overdue.length, today: today.length, upcoming: upcoming.length },
      trackedTodaySeconds: trackedByDate.get(date) ?? 0,
      trackedWeekSeconds: trackedDays.reduce((total, day) => total + day.seconds, 0),
      trackedDays,
      agenda,
    });
    res.set("Cache-Control", "private, no-store");
    res.json(response);
  } catch (error) {
    next(error);
  }
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
    const [task, comments, userTimeEntries] = await Promise.all([
      storage.getTaskWithRelations(req.params.id),
      storage.getCommentsByTask(req.params.id),
      storage.getTimeEntriesByUser(req.user!.id, auth.workspaceId),
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
      timeEntries: userTimeEntries.filter((entry) => entry.taskId === task.id).map(toDesktopTimeEntry),
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

async function ensureOwnedDesktopTimeEntry(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  try {
    const auth = req.desktopAuth!;
    const entry = await storage.getTimeEntryByIdAndTenant(req.params.id, auth.tenantId);
    if (!entry || entry.userId !== req.user!.id || entry.workspaceId !== auth.workspaceId) {
      res.status(404).json({ error: "Time entry not found" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

router.patch("/time-entries/:id", ensureOwnedDesktopTimeEntry);
router.delete("/time-entries/:id", ensureOwnedDesktopTimeEntry);

// Mount the existing domain handlers under the versioned desktop namespace so
// task completion, notifications, automations, comments and time tracking keep
// exactly the same server-side semantics as the web client.
router.use(tasksRouter);
router.use(commentsRouter);
router.use(subtasksRouter);
router.use(timeRouter);

export default router;
