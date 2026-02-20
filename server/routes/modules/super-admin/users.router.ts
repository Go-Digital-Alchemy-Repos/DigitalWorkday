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
} from '@shared/schema';
import * as schema from '@shared/schema';
import { cleanupUserReferences } from '../../../utils/userDeletion';
import { eq, sql, desc, and, count, gte, isNull, ne, inArray } from 'drizzle-orm';
import { z } from 'zod';

export const superUsersRouter = Router();

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
          sql`(LOWER(${invitations.email}) LIKE ${searchTerm} OR LOWER(${invitations.firstName}) LIKE ${searchTerm} OR LOWER(${invitations.lastName}) LIKE ${searchTerm})`
        );
      }

      if (tenantId && typeof tenantId === "string" && tenantId !== "all") {
        inviteConditions.push(eq(invitations.tenantId, tenantId));
      }

      if (role && typeof role === "string" && ["admin", "employee"].includes(role)) {
        inviteConditions.push(eq(invitations.role, role));
      }

      const countResult = await db.select({ count: count() })
        .from(invitations)
        .where(and(...inviteConditions));
      const totalCount = countResult[0]?.count || 0;

      const inviteList = await db.select({
        id: invitations.id,
        email: invitations.email,
        firstName: invitations.firstName,
        lastName: invitations.lastName,
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

    if (role && typeof role === "string" && ["admin", "employee"].includes(role)) {
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

superUsersRouter.patch("/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const data = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "employee"]).optional(),
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
        const emailService = (await import("../../../services/email")).default;
        const isConfigured = await emailService.verifyConfiguration();
        if (isConfigured) {
          await emailService.sendEmail({
            to: existingUser.email,
            subject: "Reset Your Password",
            html: `
              <h2>Password Reset</h2>
              <p>A password reset has been requested for your account.</p>
              <p><a href="${resetUrl}">Click here to set your new password</a></p>
              <p>This link expires in 24 hours.</p>
            `,
          });
          emailSent = true;
        }
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
