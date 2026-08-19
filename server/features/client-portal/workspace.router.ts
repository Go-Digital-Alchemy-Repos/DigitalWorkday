import { Router } from "express";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { AppError, handleRouteError } from "../../lib/errors";
import {
  ClientAccessLevel,
  ClientAccessStatus,
  InvitationStatus,
  UserRole,
  activityLog,
  clientContacts,
  clientDivisions,
  clientUserAccess,
  clients,
  passwordResetTokens,
  projectMembers,
  projects,
  sections,
  subtasks,
  tags,
  taskAssignees,
  taskTags,
  tasks,
  users,
} from "@shared/schema";
import { buildAppUrl } from "../../lib/appLinks";
import {
  countActiveClientAdmins,
  getPortalCapabilities,
  normalizePortalAccessLevel,
  requireActivePortalAccess,
} from "../../services/portalAuthorization";

const router = Router();

router.use((req, _res, next) => {
  if (!req.user || req.user.role !== UserRole.CLIENT) {
    return next(AppError.forbidden("This endpoint is only accessible to client portal users"));
  }
  next();
});

const overviewFields = {
  companyName: true,
  displayName: true,
  legalName: true,
  website: true,
  industry: true,
  companySize: true,
  foundedDate: true,
  description: true,
  phone: true,
  email: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  mailingAddressLine1: true,
  mailingAddressLine2: true,
  mailingCity: true,
  mailingState: true,
  mailingPostalCode: true,
  mailingCountry: true,
  primaryContactName: true,
  primaryContactEmail: true,
  primaryContactPhone: true,
} as const;

const nullableText = z.string().max(5000).nullable().optional();
const overviewUpdateSchema = z.object({
  companyName: z.string().min(1).max(255).optional(),
  displayName: nullableText,
  legalName: nullableText,
  website: nullableText,
  industry: nullableText,
  companySize: nullableText,
  foundedDate: nullableText,
  description: nullableText,
  phone: nullableText,
  email: z.string().email().nullable().optional(),
  addressLine1: nullableText,
  addressLine2: nullableText,
  city: nullableText,
  state: nullableText,
  postalCode: nullableText,
  country: nullableText,
  mailingAddressLine1: nullableText,
  mailingAddressLine2: nullableText,
  mailingCity: nullableText,
  mailingState: nullableText,
  mailingPostalCode: nullableText,
  mailingCountry: nullableText,
  primaryContactName: nullableText,
  primaryContactEmail: z.string().email().nullable().optional(),
  primaryContactPhone: nullableText,
}).strict();

function toSafeOverview(client: typeof clients.$inferSelect) {
  return Object.fromEntries(Object.keys(overviewFields).map((key) => [key, client[key as keyof typeof overviewFields]]));
}

function safeContact(contact: typeof clientContacts.$inferSelect) {
  const { id, clientId, firstName, lastName, title, email, phone, isPrimary, createdAt, updatedAt } = contact;
  return { id, clientId, firstName, lastName, title, email, phone, isPrimary, createdAt, updatedAt };
}

async function getVisibleProject(userId: string, clientId: string, projectId: string) {
  await requireActivePortalAccess(userId, clientId);
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
  if (!project || project.visibility === "private") throw AppError.notFound("Project");
  return project;
}

async function getVisibleTask(userId: string, clientId: string, taskId: string) {
  await requireActivePortalAccess(userId, clientId);
  const [row] = await db.select({ task: tasks, project: projects })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), eq(projects.clientId, clientId)))
    .limit(1);
  if (!row || row.task.visibility === "private" || row.project.visibility === "private") throw AppError.notFound("Task");
  return row;
}

router.get("/clients/:clientId", async (req, res) => {
  try {
    const access = await requireActivePortalAccess(req.user!.id, req.params.clientId);
    const client = await storage.getClient(req.params.clientId);
    if (!client) throw AppError.notFound("Client");
    res.json({
      id: client.id,
      overview: toSafeOverview(client),
      accessLevel: normalizePortalAccessLevel(access.accessLevel),
      status: access.status,
      capabilities: getPortalCapabilities(access.accessLevel),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId", req);
  }
});

router.patch("/clients/:clientId/overview", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const data = overviewUpdateSchema.parse(req.body);
    const [updated] = await db.update(clients).set({ ...data, updatedAt: new Date() })
      .where(eq(clients.id, req.params.clientId)).returning();
    if (!updated) throw AppError.notFound("Client");
    res.json(toSafeOverview(updated));
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/overview", req);
  }
});

router.get("/clients/:clientId/divisions", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId);
    const rows = await db.select({
      id: clientDivisions.id,
      name: clientDivisions.name,
      description: clientDivisions.description,
      color: clientDivisions.color,
      isActive: clientDivisions.isActive,
    }).from(clientDivisions).where(and(eq(clientDivisions.clientId, req.params.clientId), eq(clientDivisions.isActive, true)));
    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/divisions", req);
  }
});

const contactSchema = z.object({
  firstName: nullableText,
  lastName: nullableText,
  title: nullableText,
  email: z.string().email().nullable().optional(),
  phone: nullableText,
  isPrimary: z.boolean().optional(),
}).strict();

router.get("/clients/:clientId/contacts", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId);
    res.json((await storage.getContactsByClient(req.params.clientId)).map(safeContact));
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/contacts", req);
  }
});

router.post("/clients/:clientId/contacts", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const data = contactSchema.parse(req.body);
    const client = await storage.getClient(req.params.clientId);
    if (!client) throw AppError.notFound("Client");
    const contact = await storage.createClientContact({ ...data, clientId: client.id, tenantId: client.tenantId, workspaceId: client.workspaceId });
    res.status(201).json(safeContact(contact));
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/contacts", req);
  }
});

router.patch("/clients/:clientId/contacts/:contactId", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const data = contactSchema.partial().parse(req.body);
    const [existing] = await db.select().from(clientContacts)
      .where(and(eq(clientContacts.id, req.params.contactId), eq(clientContacts.clientId, req.params.clientId))).limit(1);
    if (!existing) throw AppError.notFound("Contact");
    const [updated] = await db.update(clientContacts).set({ ...data, updatedAt: new Date() })
      .where(eq(clientContacts.id, existing.id)).returning();
    res.json(safeContact(updated));
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/contacts/:contactId", req);
  }
});

const projectCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: nullableText,
  divisionId: z.string().uuid().nullable().optional(),
  color: z.string().max(32).optional(),
  status: z.enum(["active", "on_hold", "completed", "archived"]).optional(),
}).strict();

router.post("/clients/:clientId/projects", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const data = projectCreateSchema.parse(req.body);
    const client = await storage.getClient(req.params.clientId);
    if (!client || !client.tenantId) throw AppError.notFound("Client");
    if (data.divisionId) {
      const [division] = await db.select({ id: clientDivisions.id }).from(clientDivisions)
        .where(and(eq(clientDivisions.id, data.divisionId), eq(clientDivisions.clientId, client.id))).limit(1);
      if (!division) throw AppError.badRequest("Division does not belong to this client");
    }
    const project = await storage.createProjectWithTenant({
      ...data,
      tenantId: client.tenantId,
      workspaceId: client.workspaceId,
      clientId: client.id,
      visibility: "workspace",
      createdBy: req.user!.id,
    }, client.tenantId);
    res.status(201).json(project);
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/projects", req);
  }
});

router.patch("/clients/:clientId/projects/:projectId", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const existing = await getVisibleProject(req.user!.id, req.params.clientId, req.params.projectId);
    const data = projectCreateSchema.partial().parse(req.body);
    const updated = await storage.updateProjectWithTenant(existing.id, existing.tenantId!, { ...data, visibility: "workspace" });
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/projects/:projectId", req);
  }
});

const taskFieldsSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: nullableText,
  status: z.enum(["todo", "in_progress", "in_review", "done", "completed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimateMinutes: z.number().int().nonnegative().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
}).strict();

async function validatePortalAssignees(clientId: string, projectId: string, assigneeIds: string[]) {
  if (!assigneeIds.length) return;
  const [portalRows, memberRows] = await Promise.all([
    db.select({ userId: clientUserAccess.userId }).from(clientUserAccess).where(and(
      eq(clientUserAccess.clientId, clientId),
      eq(clientUserAccess.status, ClientAccessStatus.ACTIVE),
      inArray(clientUserAccess.userId, assigneeIds),
    )),
    db.select({ userId: projectMembers.userId }).from(projectMembers).where(and(
      eq(projectMembers.projectId, projectId),
      inArray(projectMembers.userId, assigneeIds),
    )),
  ]);
  const allowed = new Set([...portalRows, ...memberRows].map((row) => row.userId));
  if (assigneeIds.some((id) => !allowed.has(id))) throw AppError.forbidden("One or more assignees are not available to this client project");
}

async function updateTaskJoins(taskId: string, tenantId: string, workspaceId: string, data: z.infer<typeof taskFieldsSchema>) {
  if (data.assigneeIds) {
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    if (data.assigneeIds.length) await db.insert(taskAssignees).values(data.assigneeIds.map((userId) => ({ taskId, userId, tenantId })));
  }
  if (data.tagIds) {
    const validTags = data.tagIds.length
      ? await db.select({ id: tags.id }).from(tags).where(and(eq(tags.workspaceId, workspaceId), inArray(tags.id, data.tagIds)))
      : [];
    if (validTags.length !== data.tagIds.length) throw AppError.badRequest("One or more tags are not available to this client project");
    await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
    if (data.tagIds.length) await db.insert(taskTags).values(data.tagIds.map((tagId) => ({ taskId, tagId })));
  }
}

router.post("/clients/:clientId/projects/:projectId/tasks", async (req, res) => {
  try {
    const access = await requireActivePortalAccess(req.user!.id, req.params.clientId);
    const project = await getVisibleProject(req.user!.id, req.params.clientId, req.params.projectId);
    const data = taskFieldsSchema.extend({ title: z.string().min(1).max(500) }).parse(req.body);
    if (data.sectionId) {
      const [section] = await db.select({ id: sections.id }).from(sections).where(and(eq(sections.id, data.sectionId), eq(sections.projectId, project.id))).limit(1);
      if (!section) throw AppError.badRequest("Section does not belong to this project");
    }
    await validatePortalAssignees(req.params.clientId, project.id, data.assigneeIds || []);
    const { assigneeIds, tagIds, ...taskData } = data;
    const task = await storage.createTaskWithTenant({
      ...taskData,
      status: taskData.status === "completed" ? "done" : taskData.status,
      projectId: project.id,
      tenantId: project.tenantId,
      visibility: "workspace",
      isPersonal: false,
      createdBy: req.user!.id,
    }, project.tenantId!);
    await updateTaskJoins(task.id, project.tenantId!, project.workspaceId, { assigneeIds, tagIds });
    res.status(201).json({ ...task, accessLevel: normalizePortalAccessLevel(access.accessLevel) });
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/projects/:projectId/tasks", req);
  }
});

router.patch("/clients/:clientId/tasks/:taskId", async (req, res) => {
  try {
    const row = await getVisibleTask(req.user!.id, req.params.clientId, req.params.taskId);
    const data = taskFieldsSchema.parse(req.body);
    if (data.sectionId) {
      const [section] = await db.select({ id: sections.id }).from(sections).where(and(eq(sections.id, data.sectionId), eq(sections.projectId, row.project.id))).limit(1);
      if (!section) throw AppError.badRequest("Section does not belong to this project");
    }
    await validatePortalAssignees(req.params.clientId, row.project.id, data.assigneeIds || []);
    const { assigneeIds, tagIds, ...taskData } = data;
    const normalized = { ...taskData, status: taskData.status === "completed" ? "done" : taskData.status, visibility: "workspace" as const };
    const updated = await storage.updateTaskWithTenant(row.task.id, row.project.tenantId!, normalized);
    await updateTaskJoins(row.task.id, row.project.tenantId!, row.project.workspaceId, { assigneeIds, tagIds });
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/tasks/:taskId", req);
  }
});

const subtaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.any().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "done", "completed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimateMinutes: z.number().int().nonnegative().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
}).strict();

router.post("/clients/:clientId/tasks/:taskId/subtasks", async (req, res) => {
  try {
    const row = await getVisibleTask(req.user!.id, req.params.clientId, req.params.taskId);
    const data = subtaskSchema.extend({ title: z.string().min(1).max(500) }).parse(req.body);
    if (data.assigneeId) await validatePortalAssignees(req.params.clientId, row.project.id, [data.assigneeId]);
    const subtask = await storage.createSubtask({ ...data, status: data.status === "completed" ? "done" : data.status, taskId: row.task.id });
    res.status(201).json(subtask);
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/tasks/:taskId/subtasks", req);
  }
});

router.patch("/clients/:clientId/subtasks/:subtaskId", async (req, res) => {
  try {
    const [subtask] = await db.select().from(subtasks).where(eq(subtasks.id, req.params.subtaskId)).limit(1);
    if (!subtask) throw AppError.notFound("Subtask");
    const row = await getVisibleTask(req.user!.id, req.params.clientId, subtask.taskId);
    const data = subtaskSchema.parse(req.body);
    if (data.assigneeId) await validatePortalAssignees(req.params.clientId, row.project.id, [data.assigneeId]);
    const updated = await storage.updateSubtask(subtask.id, { ...data, status: data.status === "completed" ? "done" : data.status, completed: data.status === "done" || data.status === "completed" });
    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/subtasks/:subtaskId", req);
  }
});

router.get("/clients/:clientId/projects/:projectId/assignees", async (req, res) => {
  try {
    await getVisibleProject(req.user!.id, req.params.clientId, req.params.projectId);
    const portalUsers = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(clientUserAccess).innerJoin(users, eq(users.id, clientUserAccess.userId))
      .where(and(eq(clientUserAccess.clientId, req.params.clientId), eq(clientUserAccess.status, ClientAccessStatus.ACTIVE), eq(users.isActive, true)));
    const projectUsers = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId))
      .where(and(eq(projectMembers.projectId, req.params.projectId), eq(users.isActive, true)));
    res.json([...new Map([...portalUsers, ...projectUsers].map((user) => [user.id, user])).values()]);
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/projects/:projectId/assignees", req);
  }
});

router.get("/clients/:clientId/projects/:projectId/tags", async (req, res) => {
  try {
    const project = await getVisibleProject(req.user!.id, req.params.clientId, req.params.projectId);
    const rows = await db.select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.workspaceId, project.workspaceId));
    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/projects/:projectId/tags", req);
  }
});

router.get("/clients/:clientId/activity", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const projectRows = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.clientId, req.params.clientId), ne(projects.visibility, "private")));
    const projectIds = projectRows.map((row) => row.id);
    if (!projectIds.length) return res.json([]);
    const taskRows = await db.select({ id: tasks.id }).from(tasks)
      .where(and(inArray(tasks.projectId, projectIds), ne(tasks.visibility, "private")));
    const taskIds = taskRows.map((row) => row.id);
    const subtaskRows = taskIds.length ? await db.select({ id: subtasks.id }).from(subtasks).where(inArray(subtasks.taskId, taskIds)) : [];
    const allowed = new Map<string, Set<string>>([
      ["project", new Set(projectIds)],
      ["task", new Set(taskIds)],
      ["subtask", new Set(subtaskRows.map((row) => row.id))],
    ]);
    const client = await storage.getClient(req.params.clientId);
    const rows = await db.select({ log: activityLog, actorName: users.name })
      .from(activityLog).leftJoin(users, eq(users.id, activityLog.actorUserId))
      .where(eq(activityLog.workspaceId, client!.workspaceId)).orderBy(desc(activityLog.createdAt)).limit(250);
    const safeDiffKeys = new Set(["entityTitle", "from", "to", "projectId", "taskId", "commentId"]);
    res.json(rows.filter(({ log }) => allowed.get(log.entityType)?.has(log.entityId)).slice(0, 100).map(({ log, actorName }) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      actorName: actorName || "Team member",
      createdAt: log.createdAt,
      details: Object.fromEntries(Object.entries((log.diffJson || {}) as Record<string, unknown>).filter(([key]) => safeDiffKeys.has(key))),
    })));
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/activity", req);
  }
});

router.get("/clients/:clientId/users", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const rows = await db.select({ access: clientUserAccess, user: users }).from(clientUserAccess)
      .innerJoin(users, eq(users.id, clientUserAccess.userId)).where(eq(clientUserAccess.clientId, req.params.clientId));
    res.json(rows.map(({ access, user }) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      accessLevel: normalizePortalAccessLevel(access.accessLevel),
      status: access.status,
      suspendedAt: access.suspendedAt,
    })));
  } catch (error) {
    return handleRouteError(res, error, "GET /client-portal/clients/:clientId/users", req);
  }
});

const portalInviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().default(""),
  accessLevel: z.enum([ClientAccessLevel.COLLABORATOR, ClientAccessLevel.CLIENT_ADMIN]).default(ClientAccessLevel.COLLABORATOR),
}).strict();

router.post("/clients/:clientId/users/invite", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const data = portalInviteSchema.parse(req.body);
    const client = await storage.getClient(req.params.clientId);
    if (!client?.tenantId) throw AppError.notFound("Client");
    const existingUser = await storage.getUserByEmail(data.email.toLowerCase());
    if (existingUser) {
      if (existingUser.role !== UserRole.CLIENT || existingUser.tenantId !== client.tenantId) {
        throw AppError.conflict("This email cannot be granted access to this Client account");
      }
      const existingAccess = await storage.getClientUserAccessByUserAndClient(existingUser.id, client.id);
      if (existingAccess) throw AppError.conflict("This user already has access to this Client account");
      const access = await storage.addClientUserAccess({
        workspaceId: client.workspaceId,
        clientId: client.id,
        userId: existingUser.id,
        accessLevel: data.accessLevel,
        status: ClientAccessStatus.ACTIVE,
      });
      return res.status(201).json({ existingUser: true, access });
    }

    const contactsForClient = await storage.getContactsByClient(client.id);
    let contact = contactsForClient.find((item) => item.email?.toLowerCase() === data.email.toLowerCase());
    if (!contact) {
      contact = await storage.createClientContact({
        tenantId: client.tenantId,
        workspaceId: client.workspaceId,
        clientId: client.id,
        firstName: data.firstName,
        lastName: data.lastName || null,
        email: data.email.toLowerCase(),
        phone: null,
        title: null,
        notes: null,
        isPrimary: false,
      });
    }
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invitation = await storage.createInvitation({
      tenantId: client.tenantId,
      workspaceId: client.workspaceId,
      email: data.email.toLowerCase(),
      role: UserRole.CLIENT,
      clientId: client.id,
      tokenHash,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdByUserId: req.user!.id,
    });
    await storage.createClientInvite({
      clientId: client.id,
      contactId: contact.id,
      email: data.email.toLowerCase(),
      roleHint: data.accessLevel,
      status: InvitationStatus.PENDING,
      tokenPlaceholder: tokenHash,
      accessClientIds: [client.id],
    });
    const registrationUrl = buildAppUrl(`/accept-invite/${token}`, req);
    const { emailOutboxService } = await import("../../services/emailOutbox");
    const result = await emailOutboxService.sendEmail({
      tenantId: client.tenantId,
      messageType: "invitation",
      toEmail: data.email,
      subject: `You've been invited to ${client.displayName || client.companyName}`,
      textBody: `Accept your client portal invitation: ${registrationUrl}`,
      htmlBody: `<p>You've been invited to the client portal for <strong>${client.displayName || client.companyName}</strong>.</p><p><a href="${registrationUrl}">Accept invitation</a></p>`,
      actionUrl: registrationUrl,
      actionLabel: "Accept invitation",
    });
    res.status(201).json({ invitationId: invitation.id, emailSent: result.success });
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/users/invite", req);
  }
});

const membershipUpdateSchema = z.object({
  accessLevel: z.enum([ClientAccessLevel.COLLABORATOR, ClientAccessLevel.CLIENT_ADMIN]).optional(),
  status: z.enum([ClientAccessStatus.ACTIVE, ClientAccessStatus.SUSPENDED]).optional(),
}).strict().refine((data) => Object.keys(data).length > 0);

router.patch("/clients/:clientId/users/:userId", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const data = membershipUpdateSchema.parse(req.body);
    const target = await storage.getClientUserAccessByUserAndClient(req.params.userId, req.params.clientId);
    if (!target) throw AppError.notFound("Portal user access");
    const removesAdmin = normalizePortalAccessLevel(target.accessLevel) === "client_admin" &&
      (data.accessLevel === ClientAccessLevel.COLLABORATOR || data.status === ClientAccessStatus.SUSPENDED);
    if (data.status === ClientAccessStatus.SUSPENDED && req.params.userId === req.user!.id) {
      throw AppError.badRequest("You cannot suspend your own Client Admin access");
    }
    if (removesAdmin && await countActiveClientAdmins(req.params.clientId) <= 1) {
      throw AppError.badRequest("The last active Client Admin cannot be suspended or demoted");
    }
    const updated = await storage.updateClientUserAccess(req.params.clientId, req.params.userId, {
      ...data,
      suspendedAt: data.status === ClientAccessStatus.SUSPENDED ? new Date() : data.status === ClientAccessStatus.ACTIVE ? null : target.suspendedAt,
      suspendedByUserId: data.status === ClientAccessStatus.SUSPENDED ? req.user!.id : data.status === ClientAccessStatus.ACTIVE ? null : target.suspendedByUserId,
    });
    res.json({ ...updated, accessLevel: normalizePortalAccessLevel(updated!.accessLevel) });
  } catch (error) {
    return handleRouteError(res, error, "PATCH /client-portal/clients/:clientId/users/:userId", req);
  }
});

router.post("/clients/:clientId/users/:userId/password-reset", async (req, res) => {
  try {
    await requireActivePortalAccess(req.user!.id, req.params.clientId, { admin: true });
    const targetAccess = await requireActivePortalAccess(req.params.userId, req.params.clientId);
    const target = await storage.getUser(req.params.userId);
    if (!target?.email || targetAccess.status !== ClientAccessStatus.ACTIVE) throw AppError.notFound("Portal user");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.userId, target.id), isNull(passwordResetTokens.usedAt)));
    await db.insert(passwordResetTokens).values({
      userId: target.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      createdByUserId: req.user!.id,
    });
    const origin = `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${origin}/auth/reset-password?token=${token}`;
    const { emailOutboxService } = await import("../../services/emailOutbox");
    const result = await emailOutboxService.sendEmail({
      tenantId: target.tenantId!,
      messageType: "forgot_password",
      toEmail: target.email,
      subject: "Reset your client portal password",
      textBody: `Reset your password using this secure link (expires in 30 minutes): ${resetUrl}`,
      htmlBody: `<p>Use the secure link below to reset your client portal password. It expires in 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p>`,
      actionUrl: resetUrl,
      actionLabel: "Reset password",
    });
    if (!result.success) throw AppError.internal("Unable to send password reset email");
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /client-portal/clients/:clientId/users/:userId/password-reset", req);
  }
});

export default router;
