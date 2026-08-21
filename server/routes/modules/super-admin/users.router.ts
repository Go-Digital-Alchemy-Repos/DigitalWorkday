import { Router } from 'express';
import multer from 'multer';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { hashPassword } from '../../../auth';
import { isS3Configured, uploadToS3, generateAvatarKey, validateAvatar } from '../../../s3';
import { deleteFromStorageByUrl } from '../../../services/uploads/s3UploadService';
import {
  UserRole,
  users,
  tenants,
  invitations,
  workspaces,
  workspaceMembers,
  teamMembers,
  projectMembers,
  divisionMembers,
  activityLog,
  comments,
  commentMentions,
  taskAssignees,
  taskWatchers,
  taskAttachments,
  personalTaskSections,
  subtasks,
  subtaskAssignees,
  hiddenProjects,
  notifications,
  notificationPreferences,
  activeTimers,
  passwordResetTokens,
  timeEntries,
  userUiPreferences,
  chatMentions,
  chatReads,
  chatChannelMembers,
  chatChannels,
  chatDmMembers,
  chatMessages,
  chatExportJobs,
  clientUserAccess,
  clientNoteAttachments,
  clientNoteVersions,
  clientNotes,
  clientDocuments,
  tenantAgreementAcceptances,
  tenantAgreements,
  tasks,
  projects,
  sections,
  appSettings,
  platformAuditEvents,
  platformInvitations,
  errorLogs,
  userActivitySessions,
} from '@shared/schema';
import * as schema from '@shared/schema';
import { cleanupUserReferences } from '../../../utils/userDeletion';
import { eq, sql, desc, and, count, gte, isNull, ne, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';

export const superUsersRouter = Router();

const SUPER_ADMIN_FILTERABLE_USER_ROLES = ["admin", "project_manager", "employee"] as const;

const activityLogQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
  category: z.enum(["all", "sessions", "tasks"]).default("all"),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

type ActivityCursor = {
  occurredAt: string;
  kind: "session" | "task";
  id: string;
  range: "7d" | "30d" | "90d";
  category: "all" | "sessions" | "tasks";
  from: string;
  to: string;
};

function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeActivityCursor(value?: string): ActivityCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || !["session", "task"].includes(parsed.kind) || typeof parsed.id !== "string"
      || !["7d", "30d", "90d"].includes(parsed.range) || !["all", "sessions", "tasks"].includes(parsed.category)
      || Number.isNaN(Date.parse(parsed.occurredAt)) || Number.isNaN(Date.parse(parsed.from)) || Number.isNaN(Date.parse(parsed.to))) return null;
    return parsed;
  } catch { return null; }
}

function activitySortKey(item: { occurredAt: string; kind: "session" | "task"; id: string }): string {
  return `${item.occurredAt}|${item.kind}|${item.id}`;
}

function actionSummary(action: string, metadata: Record<string, unknown>, title: string): string {
  if (action === "status_changed") return `Changed status on ${title}`;
  if (action === "comment_added") return `Added a comment to ${title}`;
  if (action.includes("attachment") || action.includes("file")) return `Added a file to ${title}`;
  if (action === "time_logged") return `Logged time on ${title}`;
  if (action === "created") return `Created ${title}`;
  if (action === "completed") return `Completed ${title}`;
  if (action === "updated" && typeof metadata.field === "string") return `Updated ${metadata.field.replaceAll("_", " ")} on ${title}`;
  return `${action.replaceAll("_", " ")} · ${title}`;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

superUsersRouter.get("/users/orphaned", requireSuperUser, async (req, res) => {
  try {
    const orphanedUsers = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(and(
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER),
      ))
      .orderBy(desc(users.createdAt));
    
    const usersWithWorkspaces = await Promise.all(
      orphanedUsers.map(async (user) => {
        const memberships = await db.select({
          workspaceId: workspaceMembers.workspaceId,
          workspaceName: workspaces.name,
          tenantId: workspaces.tenantId,
        })
          .from(workspaceMembers)
          .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
          .where(eq(workspaceMembers.userId, user.id))
          .limit(5);
        
        return {
          ...user,
          workspaceMemberships: memberships,
          suggestedTenantId: memberships[0]?.tenantId || null,
        };
      })
    );
    
    res.json({
      orphanedCount: orphanedUsers.length,
      users: usersWithWorkspaces,
    });
  } catch (error) {
    console.error("[orphaned-users] Error:", error);
    res.status(500).json({ error: "Failed to fetch orphaned users" });
  }
});

superUsersRouter.get("/users", requireSuperUser, async (req, res) => {
  try {
    const { search, tenantId, status, role, page = "1", pageSize = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize as string) || 50));
    const offset = (pageNum - 1) * limit;

    if (status === "pending") {
      const inviteConditions: any[] = [
        eq(invitations.status, "pending"),
        gte(invitations.expiresAt, new Date()),
      ];

      if (search && typeof search === "string" && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        inviteConditions.push(
          sql`LOWER(${invitations.email}) LIKE ${searchTerm}`
        );
      }

      if (tenantId && typeof tenantId === "string" && tenantId !== "all") {
        inviteConditions.push(eq(invitations.tenantId, tenantId));
      }

      if (
        role &&
        typeof role === "string" &&
        SUPER_ADMIN_FILTERABLE_USER_ROLES.includes(role as (typeof SUPER_ADMIN_FILTERABLE_USER_ROLES)[number])
      ) {
        inviteConditions.push(eq(invitations.role, role));
      }

      const countResult = await db.select({ count: count() })
        .from(invitations)
        .where(and(...inviteConditions));
      const totalCount = countResult[0]?.count || 0;

      const inviteList = await db.select({
        id: invitations.id,
        email: invitations.email,
        firstName: sql<string | null>`NULL`,
        lastName: sql<string | null>`NULL`,
        role: invitations.role,
        tenantId: invitations.tenantId,
        tenantName: tenants.name,
        tenantStatus: tenants.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
        .from(invitations)
        .leftJoin(tenants, eq(invitations.tenantId, tenants.id))
        .where(and(...inviteConditions))
        .orderBy(desc(invitations.createdAt))
        .limit(limit)
        .offset(offset);

      return res.json({
        users: inviteList.map(inv => ({
          id: inv.id,
          email: inv.email,
          name: inv.firstName && inv.lastName ? `${inv.firstName} ${inv.lastName}` : null,
          firstName: inv.firstName,
          lastName: inv.lastName,
          role: inv.role,
          isActive: false,
          isPendingInvite: true,
          avatarUrl: null,
          tenantId: inv.tenantId,
          tenantName: inv.tenantName,
          tenantStatus: inv.tenantStatus,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          updatedAt: null,
          hasPendingInvite: true,
        })),
        total: totalCount,
        page: pageNum,
        pageSize: limit,
        totalPages: Math.ceil(totalCount / limit),
      });
    }

    const conditions: any[] = [
      ne(users.role, UserRole.SUPER_USER),
    ];

    if (search && typeof search === "string" && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        sql`(LOWER(${users.email}) LIKE ${searchTerm} OR LOWER(${users.name}) LIKE ${searchTerm} OR LOWER(${users.firstName}) LIKE ${searchTerm} OR LOWER(${users.lastName}) LIKE ${searchTerm})`
      );
    }

    if (tenantId && typeof tenantId === "string" && tenantId !== "all") {
      conditions.push(eq(users.tenantId, tenantId));
    }

    if (status && typeof status === "string") {
      if (status === "active") {
        conditions.push(eq(users.isActive, true));
      } else if (status === "inactive") {
        conditions.push(eq(users.isActive, false));
      }
    }

    if (
      role &&
      typeof role === "string" &&
      SUPER_ADMIN_FILTERABLE_USER_ROLES.includes(role as (typeof SUPER_ADMIN_FILTERABLE_USER_ROLES)[number])
    ) {
      conditions.push(eq(users.role, role as any));
    }

    const countResult = await db.select({ count: count() })
      .from(users)
      .where(and(...conditions));
    const totalCount = countResult[0]?.count || 0;

    const userList = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isActive: users.isActive,
      avatarUrl: users.avatarUrl,
      tenantId: users.tenantId,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      passwordHash: users.passwordHash,
    })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const userEmails = userList.map(u => u.email);
    let pendingInvites: Record<string, boolean> = {};
    
    if (userEmails.length > 0) {
      const inviteResults = await db.select({
        email: invitations.email,
      })
        .from(invitations)
        .where(and(
          inArray(invitations.email, userEmails),
          eq(invitations.status, "pending"),
          gte(invitations.expiresAt, new Date())
        ));
      
      inviteResults.forEach(inv => {
        pendingInvites[inv.email] = true;
      });
    }

    res.json({
      users: userList.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: u.isActive,
        isPendingInvite: false,
        needsPassword: u.passwordHash === null,
        avatarUrl: u.avatarUrl,
        tenantId: u.tenantId,
        tenantName: u.tenantName,
        tenantStatus: u.tenantStatus,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        hasPendingInvite: pendingInvites[u.email] || false,
      })),
      total: totalCount,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("[super/users] Error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

superUsersRouter.get("/users/:userId/activity", requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activityCountResult = await db.select({ count: count() })
      .from(activityLog)
      .where(and(
        eq(activityLog.actorUserId, userId),
        gte(activityLog.createdAt, thirtyDaysAgo)
      ));

    const recentActivity = await db.select({
      id: activityLog.id,
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      metadata: activityLog.diffJson,
      createdAt: activityLog.createdAt,
    })
      .from(activityLog)
      .where(eq(activityLog.actorUserId, userId))
      .orderBy(desc(activityLog.createdAt))
      .limit(10);

    const taskCountResult = await db.select({ count: count() })
      .from(taskAssignees)
      .where(eq(taskAssignees.userId, userId));

    const commentCountResult = await db.select({ count: count() })
      .from(comments)
      .where(eq(comments.userId, userId));

    res.json({
      userId,
      activityCount30Days: activityCountResult[0]?.count || 0,
      taskCount: taskCountResult[0]?.count || 0,
      commentCount: commentCountResult[0]?.count || 0,
      recentActivity,
    });
  } catch (error) {
    console.error("[super/users/activity] Error:", error);
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
});

superUsersRouter.get("/users/:userId/activity-log", requireSuperUser, async (req, res) => {
  const parsed = activityLogQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid activity-log query" });
  const cursor = decodeActivityCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) return res.status(400).json({ error: "Invalid activity cursor" });
  if (cursor && (cursor.range !== parsed.data.range || cursor.category !== parsed.data.category)) {
    return res.status(400).json({ error: "Activity cursor does not match the requested filters" });
  }

  try {
    const { userId } = req.params;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const days = Number.parseInt(parsed.data.range, 10);
    const to = cursor ? new Date(cursor.to) : new Date();
    const from = cursor ? new Date(cursor.from) : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const cursorDate = cursor ? new Date(cursor.occurredAt) : null;
    const fetchLimit = parsed.data.limit + 1;

    const [sessionSummary] = await db.select({
      activeSeconds: sql<number>`COALESCE(SUM(${userActivitySessions.activeSeconds}), 0)::int`,
      sessionCount: sql<number>`COUNT(*)::int`,
    }).from(userActivitySessions).where(and(
      eq(userActivitySessions.userId, userId),
      gte(userActivitySessions.startedAt, from),
      lte(userActivitySessions.startedAt, to),
    ));

    const [lastLogin] = await db.select({ startedAt: userActivitySessions.startedAt })
      .from(userActivitySessions)
      .where(eq(userActivitySessions.userId, userId))
      .orderBy(desc(userActivitySessions.startedAt))
      .limit(1);
    const [trackingStart] = await db.select({
      startedAt: sql<Date | null>`MIN(${userActivitySessions.startedAt})`,
    }).from(userActivitySessions).where(eq(userActivitySessions.userId, userId));

    const touchedResult = await db.execute(sql`
      SELECT COUNT(DISTINCT CASE
        WHEN al.entity_type = 'task' THEN al.entity_id
        WHEN al.entity_type = 'subtask' THEN COALESCE(al.diff_json->>'taskId', st.task_id)
      END)::int AS count
      FROM activity_log al
      LEFT JOIN subtasks st ON al.entity_type = 'subtask' AND st.id = al.entity_id
      WHERE al.actor_user_id = ${userId}
        AND al.created_at >= ${from}
        AND al.created_at <= ${to}
        AND al.entity_type IN ('task', 'subtask')
        AND al.action NOT IN ('viewed', 'opened')
    `);
    const distinctTasksTouched = Number((touchedResult.rows[0] as { count?: number | string } | undefined)?.count || 0);

    const sessionRows = parsed.data.category === "tasks" ? [] : await db.select({
      id: userActivitySessions.id,
      platform: userActivitySessions.platform,
      deviceLabel: userActivitySessions.deviceLabel,
      state: userActivitySessions.state,
      startedAt: userActivitySessions.startedAt,
      endedAt: userActivitySessions.endedAt,
      lastSeenAt: userActivitySessions.lastSeenAt,
      activeSeconds: userActivitySessions.activeSeconds,
    }).from(userActivitySessions).where(and(
      eq(userActivitySessions.userId, userId),
      gte(userActivitySessions.startedAt, from),
      lte(userActivitySessions.startedAt, to),
      cursorDate ? sql`(${userActivitySessions.startedAt}, 'session', ${userActivitySessions.id}) < (${cursorDate}, ${cursor!.kind}, ${cursor!.id})` : undefined,
    )).orderBy(desc(userActivitySessions.startedAt), desc(userActivitySessions.id)).limit(fetchLimit);

    const activityRows = parsed.data.category === "sessions" ? [] : await db.select({
      id: activityLog.id,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      action: activityLog.action,
      metadata: activityLog.diffJson,
      createdAt: activityLog.createdAt,
    }).from(activityLog).where(and(
      eq(activityLog.actorUserId, userId),
      inArray(activityLog.entityType, ["task", "subtask"]),
      sql`${activityLog.action} NOT IN ('viewed', 'opened')`,
      gte(activityLog.createdAt, from),
      lte(activityLog.createdAt, to),
      cursorDate ? sql`(${activityLog.createdAt}, 'task', ${activityLog.id}) < (${cursorDate}, ${cursor!.kind}, ${cursor!.id})` : undefined,
    )).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(fetchLimit);

    const subtaskIds = activityRows.filter((row) => row.entityType === "subtask").map((row) => row.entityId);
    const subtaskRows = subtaskIds.length ? await db.select({ id: subtasks.id, taskId: subtasks.taskId })
      .from(subtasks).where(inArray(subtasks.id, subtaskIds)) : [];
    const subtaskParent = new Map(subtaskRows.map((row) => [row.id, row.taskId]));
    const taskIdFor = (row: typeof activityRows[number]) => {
      const metadata = metadataRecord(row.metadata);
      return row.entityType === "task" ? row.entityId
        : typeof metadata.taskId === "string" ? metadata.taskId
        : subtaskParent.get(row.entityId) || null;
    };
    const taskIds = Array.from(new Set(activityRows.map(taskIdFor).filter((id): id is string => Boolean(id))));
    const taskRows = taskIds.length ? await db.select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
    }).from(tasks).where(inArray(tasks.id, taskIds)) : [];
    const projectIds = Array.from(new Set(taskRows.map((task) => task.projectId).filter((id): id is string => Boolean(id))));
    const projectRows = projectIds.length ? await db.select({ id: projects.id, name: projects.name })
      .from(projects).where(inArray(projects.id, projectIds)) : [];
    const projectsById = new Map(projectRows.map((project) => [project.id, project.name]));
    const tasksById = new Map(taskRows.map((task) => [task.id, task]));

    const items: Array<any> = [
      ...sessionRows.map((session) => ({
        id: session.id,
        kind: "session" as const,
        occurredAt: session.startedAt.toISOString(),
        title: `${session.platform === "macos" ? "Mac" : "Browser"} session`,
        detail: `${session.deviceLabel} · ${Math.max(0, session.activeSeconds)}s active`,
        platform: session.platform,
        deviceLabel: session.deviceLabel,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() || null,
        activeSeconds: session.activeSeconds,
        state: session.state,
      })),
      ...activityRows.map((activity) => {
        const metadata = metadataRecord(activity.metadata);
        const taskId = taskIdFor(activity);
        const task = taskId ? tasksById.get(taskId) : undefined;
        const fallbackTitle = typeof metadata.entityTitle === "string" ? metadata.entityTitle : "Deleted task";
        const title = task?.title || fallbackTitle;
        return {
          id: activity.id,
          kind: "task" as const,
          occurredAt: activity.createdAt.toISOString(),
          title: actionSummary(activity.action, metadata, title),
          detail: task?.projectId ? projectsById.get(task.projectId) || null : null,
          action: activity.action,
          task: task ? { id: task.id, title: task.title, projectName: task.projectId ? projectsById.get(task.projectId) || null : null } : null,
          isTaskAvailable: Boolean(task),
        };
      }),
    ].sort((a, b) => activitySortKey(b).localeCompare(activitySortKey(a)));

    const page = items.slice(0, parsed.data.limit + 1);
    const hasMore = page.length > parsed.data.limit;
    const visible = page.slice(0, parsed.data.limit);
    const tail = visible.at(-1);

    res.set("Cache-Control", "private, no-store");
    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      trackingStartedAt: trackingStart?.startedAt?.toISOString() || null,
      summary: {
        lastLoginAt: lastLogin?.startedAt.toISOString() || null,
        activeSeconds: Number(sessionSummary?.activeSeconds || 0),
        sessionCount: Number(sessionSummary?.sessionCount || 0),
        distinctTasksTouched,
      },
      items: visible,
      nextCursor: hasMore && tail ? encodeActivityCursor({
        occurredAt: tail.occurredAt,
        kind: tail.kind,
        id: tail.id,
        range: parsed.data.range,
        category: parsed.data.category,
        from: from.toISOString(),
        to: to.toISOString(),
      }) : null,
    });
  } catch (error) {
    console.error("[super/users/activity-log] Error:", error);
    res.status(500).json({ error: "Failed to fetch user activity log" });
  }
});

superUsersRouter.get("/tasks/:taskId", requireSuperUser, async (req, res) => {
  try {
    const [task] = await db.select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      archivedAt: tasks.archivedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      tenantId: tasks.tenantId,
      projectId: tasks.projectId,
      projectName: projects.name,
    }).from(tasks).leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, req.params.taskId)).limit(1);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const [assignees, history] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
        .from(taskAssignees).innerJoin(users, eq(taskAssignees.userId, users.id))
        .where(eq(taskAssignees.taskId, task.id)),
      db.select({
        id: activityLog.id,
        action: activityLog.action,
        metadata: activityLog.diffJson,
        createdAt: activityLog.createdAt,
      }).from(activityLog).where(sql`(
        (${activityLog.entityType} = 'task' AND ${activityLog.entityId} = ${task.id}) OR
        (${activityLog.entityType} = 'subtask' AND ${activityLog.diffJson}->>'taskId' = ${task.id})
      )`)
        .orderBy(desc(activityLog.createdAt)).limit(100),
    ]);
    res.set("Cache-Control", "private, no-store");
    res.json({ task, assignees, history });
  } catch (error) {
    console.error("[super/tasks/detail] Error:", error);
    res.status(500).json({ error: "Failed to fetch task detail" });
  }
});

superUsersRouter.patch("/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const data = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "project_manager", "employee"]).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    const superUser = req.user!;
    
    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (existingUser.role === UserRole.SUPER_USER) {
      return res.status(403).json({ error: "Cannot modify super users through this endpoint" });
    }
    
    if (data.email && data.email !== existingUser.email) {
      const existingWithEmail = await storage.getUserByEmail(data.email);
      if (existingWithEmail) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }
    
    const updates: any = { updatedAt: new Date() };
    if (data.firstName !== undefined) {
      updates.firstName = data.firstName;
      updates.name = `${data.firstName} ${data.lastName || existingUser.lastName || ""}`.trim();
    }
    if (data.lastName !== undefined) {
      updates.lastName = data.lastName;
      updates.name = `${data.firstName || existingUser.firstName || ""} ${data.lastName}`.trim();
    }
    if (data.email !== undefined) updates.email = data.email;
    if (data.role) updates.role = data.role;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    
    const [updatedUser] = await db.update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    
    console.log(`[super/users/:userId PATCH] User ${existingUser.email} updated by super admin ${superUser?.email}:`, Object.keys(data).join(", "));
    
    res.json({
      user: updatedUser,
      message: "User updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[super/users/:userId] Error:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

superUsersRouter.post("/users/:userId/avatar", requireSuperUser, avatarUpload.single("file"), async (req, res) => {
  try {
    const { userId } = req.params;
    const superUser = req.user as any;

    if (!isS3Configured()) {
      return res.status(503).json({ error: "S3 storage is not configured" });
    }

    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (existingUser.role === UserRole.SUPER_USER) {
      return res.status(403).json({ error: "Cannot modify super users through this endpoint" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const mimeType = req.file.mimetype;
    const validation = validateAvatar(mimeType, req.file.size);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error || "Invalid avatar file" });
    }

    if (existingUser.avatarUrl) {
      deleteFromStorageByUrl(existingUser.avatarUrl, existingUser.tenantId).catch(err => {
        console.error("[super/users/:userId/avatar] Failed to delete old avatar:", err);
      });
    }

    const storageKey = generateAvatarKey(existingUser.tenantId, userId, req.file.originalname);
    const url = await uploadToS3(req.file.buffer, storageKey, mimeType);

    await db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, userId));

    console.log(`[super/users/:userId/avatar] Avatar updated for ${existingUser.email} by super admin ${superUser?.email}`);

    res.json({ url });
  } catch (error) {
    console.error("[super/users/:userId/avatar] Error:", error);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

superUsersRouter.delete("/users/:userId/avatar", requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const superUser = req.user as any;

    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (existingUser.role === UserRole.SUPER_USER) {
      return res.status(403).json({ error: "Cannot modify super users through this endpoint" });
    }

    if (existingUser.avatarUrl) {
      deleteFromStorageByUrl(existingUser.avatarUrl, existingUser.tenantId).catch(err => {
        console.error("[super/users/:userId/avatar] Failed to delete old avatar:", err);
      });
    }

    await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, userId));

    console.log(`[super/users/:userId/avatar] Avatar removed for ${existingUser.email} by super admin ${superUser?.email}`);

    res.json({ ok: true });
  } catch (error) {
    console.error("[super/users/:userId/avatar] Error:", error);
    res.status(500).json({ error: "Failed to remove avatar" });
  }
});

superUsersRouter.post("/users/:userId/set-password", requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const data = z.object({
      password: z.string().min(8, "Password must be at least 8 characters"),
      mustChangeOnNextLogin: z.boolean().default(true),
    }).parse(req.body);
    
    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (existingUser.role === UserRole.SUPER_USER) {
      return res.status(403).json({ error: "Cannot modify super users through this endpoint" });
    }
    
    const passwordHash = await hashPassword(data.password);
    
    await db.update(users)
      .set({ 
        passwordHash,
        mustChangePasswordOnNextLogin: data.mustChangeOnNextLogin,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    res.json({ message: "Password set successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[super/users/:userId/set-password] Error:", error);
    res.status(500).json({ error: "Failed to set password" });
  }
});

superUsersRouter.post("/users/:userId/generate-reset-link", requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const { sendEmail } = z.object({
      sendEmail: z.boolean().optional().default(false),
    }).parse(req.body);
    const superUser = req.user!;
    
    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (existingUser.role === UserRole.SUPER_USER) {
      return res.status(403).json({ error: "Cannot generate reset links for super users through this endpoint" });
    }
    
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt)
        )
      );
    
    await db.insert(passwordResetTokens).values({
      userId: userId,
      tokenHash,
      expiresAt: expiry,
    });
    
    const appPublicUrl = process.env.APP_PUBLIC_URL;
    if (!appPublicUrl) {
      console.warn("[generate-reset-link] APP_PUBLIC_URL not set, link may be incorrect behind proxy");
    }
    const baseUrl = appPublicUrl || `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
    
    let emailSent = false;
    if (sendEmail) {
      try {
        const { emailTemplateService } = await import("../../../services/emailTemplates");
        const { emailOutboxService } = await import("../../../services/emailOutbox");
        const templateVars = {
          userName: existingUser.name || existingUser.email,
          userEmail: existingUser.email,
          resetUrl,
          expiryHours: "24",
          appName: "MyWorkDay",
        };
        const rendered = await emailTemplateService.renderByKey(existingUser.tenantId, "admin_password_reset", templateVars);
        await emailOutboxService.sendEmail({
          tenantId: existingUser.tenantId,
          messageType: "admin_password_reset",
          toEmail: existingUser.email,
          subject: rendered?.subject || "Reset Your Password",
          textBody: rendered?.textBody || `A password reset has been requested for your account.\n\nReset your password: ${resetUrl}\n\nThis link expires in 24 hours.`,
          htmlBody: rendered?.htmlBody,
          metadata: { userId: existingUser.id },
        });
        emailSent = true;
      } catch (emailError) {
        console.warn("[generate-reset-link] Could not send email:", emailError);
      }
    }
    
    console.log(`[super/users/:userId/generate-reset-link] Reset link generated for user ${existingUser.email} by super admin ${superUser?.email}`);
    
    res.json({
      message: "Password reset link generated successfully",
      resetUrl,
      expiresAt: expiry.toISOString(),
      emailSent,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[super/users/:userId/generate-reset-link] Error:", error);
    res.status(500).json({ error: "Failed to generate reset link" });
  }
});

superUsersRouter.delete("/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const superUser = req.user!;
    
    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (existingUser.role === UserRole.SUPER_USER) {
      return res.status(403).json({ error: "Cannot delete super users through this endpoint. Use the Platform Admins section instead." });
    }
    
    const actorId = superUser?.id;
    if (!actorId) {
      return res.status(401).json({ error: "Actor identity required for user deletion" });
    }
    await db.transaction(async (tx) => {
      await cleanupUserReferences(tx, userId, actorId);
      await tx.delete(users).where(eq(users.id, userId));
    });
    
    console.log(`[super/users/:userId DELETE] User ${existingUser.email} (tenant: ${existingUser.tenantId}) deleted by super admin ${superUser?.email}`);
    
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("[super/users/:userId DELETE] Error:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});
