import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { hashPassword } from '../../../auth';
import { z } from 'zod';
import { eq, and, desc, count } from 'drizzle-orm';
import {
  users,
  UserRole,
  platformInvitations,
  platformAuditEvents,
  taskAssignees,
  taskWatchers,
  workspaceMembers,
  teamMembers,
  projectMembers,
  divisionMembers,
  hiddenProjects,
  personalTaskSections,
  subtaskAssignees,
  clientUserAccess,
  notifications,
  notificationPreferences,
  activeTimers,
  passwordResetTokens,
  timeEntries,
  userUiPreferences,
  chatMentions,
  chatReads,
  chatChannelMembers,
  chatDmMembers,
  chatMessages,
  chatExportJobs,
  chatChannels,
  commentMentions,
  comments,
  activityLog,
  taskAttachments,
  clientNoteAttachments,
  clientNoteVersions,
  clientNotes,
  clientDocuments,
  tenantAgreementAcceptances,
  tasks,
  subtasks,
  projects,
  sections,
  invitations,
  appSettings,
  workspaces,
  tenantAgreements,
  errorLogs,
} from '@shared/schema';
import * as schema from '@shared/schema';
import { cleanupUserReferences } from '../../../utils/userDeletion';

export const adminsRouter = Router();

adminsRouter.get("/admins", requireSuperUser, async (req, res) => {
  try {
    const admins = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      createdAt: users.createdAt,
      passwordHash: users.passwordHash,
    }).from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .orderBy(desc(users.createdAt));
    
    const adminsWithStatus = await Promise.all(admins.map(async (admin) => {
      const pendingInvite = admin.passwordHash === null ? await db.select({
        id: platformInvitations.id,
        expiresAt: platformInvitations.expiresAt,
      }).from(platformInvitations)
        .where(and(
          eq(platformInvitations.targetUserId, admin.id),
          eq(platformInvitations.status, "pending")
        ))
        .orderBy(desc(platformInvitations.createdAt))
        .limit(1) : [];
      
      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        firstName: admin.firstName,
        lastName: admin.lastName,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
        hasPendingInvite: pendingInvite.length > 0,
        inviteExpiresAt: pendingInvite[0]?.expiresAt || null,
        passwordSet: admin.passwordHash !== null,
      };
    }));
    
    res.json(adminsWithStatus);
  } catch (error) {
    console.error("[admins] Failed to list platform admins:", error);
    res.status(500).json({ error: "Failed to list platform admins" });
  }
});

adminsRouter.get("/admins/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [admin] = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      createdAt: users.createdAt,
      passwordHash: users.passwordHash,
    }).from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!admin) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    const pendingInvite = admin.passwordHash === null ? await db.select({
      id: platformInvitations.id,
      expiresAt: platformInvitations.expiresAt,
      createdAt: platformInvitations.createdAt,
    }).from(platformInvitations)
      .where(and(
        eq(platformInvitations.targetUserId, admin.id),
        eq(platformInvitations.status, "pending")
      ))
      .orderBy(desc(platformInvitations.createdAt))
      .limit(1) : [];
    
    const recentAuditEvents = await db.select()
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.targetUserId, id))
      .orderBy(desc(platformAuditEvents.createdAt))
      .limit(10);
    
    res.json({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      firstName: admin.firstName,
      lastName: admin.lastName,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      hasPendingInvite: pendingInvite.length > 0,
      inviteExpiresAt: pendingInvite[0]?.expiresAt || null,
      passwordSet: admin.passwordHash !== null,
      recentAuditEvents,
    });
  } catch (error) {
    console.error("[admins] Failed to get platform admin:", error);
    res.status(500).json({ error: "Failed to get platform admin" });
  }
});

const createPlatformAdminSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

adminsRouter.post("/admins", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user!;
    const body = createPlatformAdminSchema.parse(req.body);
    
    const [existing] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()));
    
    if (existing) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    
    const [newAdmin] = await db.insert(users).values({
      email: body.email.toLowerCase(),
      firstName: body.firstName,
      lastName: body.lastName,
      name: `${body.firstName} ${body.lastName}`,
      role: UserRole.SUPER_USER,
      isActive: true,
      passwordHash: null,
    }).returning();
    
    await db.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      targetUserId: newAdmin.id,
      eventType: "platform_admin_created",
      message: `Platform admin account created for ${body.email}`,
      metadata: { email: body.email, firstName: body.firstName, lastName: body.lastName },
    });
    
    res.status(201).json({
      id: newAdmin.id,
      email: newAdmin.email,
      name: newAdmin.name,
      firstName: newAdmin.firstName,
      lastName: newAdmin.lastName,
      isActive: newAdmin.isActive,
      createdAt: newAdmin.createdAt,
      passwordSet: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors });
    }
    console.error("[admins] Failed to create platform admin:", error);
    res.status(500).json({ error: "Failed to create platform admin" });
  }
});

const updatePlatformAdminSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

adminsRouter.patch("/admins/:id", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user!;
    const { id } = req.params;
    const body = updatePlatformAdminSchema.parse(req.body);
    
    const [currentAdmin] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!currentAdmin) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    if (body.isActive === false && currentAdmin.isActive) {
      const activeAdminCount = await db.select({ count: count() })
        .from(users)
        .where(and(
          eq(users.role, UserRole.SUPER_USER),
          eq(users.isActive, true)
        ));
      
      if (activeAdminCount[0]?.count <= 1) {
        return res.status(400).json({ 
          error: "Cannot deactivate the last active platform admin",
          code: "LAST_ADMIN_PROTECTION"
        });
      }
    }
    
    if (body.email && body.email.toLowerCase() !== currentAdmin.email) {
      const [existing] = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.email, body.email.toLowerCase()));
      
      if (existing) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }
    }
    
    const updateData: any = {};
    if (body.email) updateData.email = body.email.toLowerCase();
    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.lastName !== undefined) updateData.lastName = body.lastName;
    if (body.firstName || body.lastName) {
      updateData.name = `${body.firstName || currentAdmin.firstName} ${body.lastName || currentAdmin.lastName}`;
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    
    const [updatedAdmin] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    
    const eventType = body.isActive === false ? "platform_admin_deactivated" 
      : body.isActive === true && !currentAdmin.isActive ? "platform_admin_reactivated"
      : "platform_admin_updated";
    
    await db.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      targetUserId: id,
      eventType,
      message: `Platform admin ${eventType === "platform_admin_deactivated" ? "deactivated" : eventType === "platform_admin_reactivated" ? "reactivated" : "updated"}: ${updatedAdmin.email}`,
      metadata: { changes: body },
    });
    
    res.json({
      id: updatedAdmin.id,
      email: updatedAdmin.email,
      name: updatedAdmin.name,
      firstName: updatedAdmin.firstName,
      lastName: updatedAdmin.lastName,
      isActive: updatedAdmin.isActive,
      createdAt: updatedAdmin.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors });
    }
    console.error("[admins] Failed to update platform admin:", error);
    res.status(500).json({ error: "Failed to update platform admin" });
  }
});

adminsRouter.delete("/admins/:id", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user!;
    const { id } = req.params;
    
    const [adminToDelete] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!adminToDelete) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    if (actor?.id === id) {
      return res.status(400).json({ 
        error: "Cannot delete yourself",
        details: "You cannot delete your own account. Another platform admin must perform this action."
      });
    }
    
    if (adminToDelete.isActive) {
      return res.status(400).json({ 
        error: "Cannot delete active platform admin",
        details: "Platform admin must be deactivated before deletion. Deactivate the admin first, then try again."
      });
    }
    
    const actorId = actor?.id;
    if (!actorId) {
      return res.status(401).json({ error: "Actor identity required for user deletion" });
    }
    await db.transaction(async (tx) => {
      await cleanupUserReferences(tx, id, actorId);
      await tx.delete(users).where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    });
    
    await db.insert(platformAuditEvents).values({
      id: crypto.randomUUID(),
      eventType: "platform_admin_deleted",
      message: `Platform admin ${adminToDelete.email} permanently deleted by ${actor?.email}`,
      actorUserId: actor?.id,
      metadata: { 
        deletedAdminId: id, 
        deletedAdminEmail: adminToDelete.email,
        deletedAt: new Date().toISOString()
      },
    });
    
    console.log(`[SuperAdmin] Platform admin ${adminToDelete.email} deleted by ${actor?.email}`);
    
    res.json({
      message: `Platform admin ${adminToDelete.email} has been permanently deleted`,
      deletedAdmin: {
        id: id,
        email: adminToDelete.email,
        name: adminToDelete.name,
      },
    });
  } catch (error) {
    console.error("[admins] Failed to delete platform admin:", error);
    res.status(500).json({ error: "Failed to delete platform admin" });
  }
});

const generateInviteSchema = z.object({
  expiresInDays: z.number().min(1).max(30).default(7),
  sendEmail: z.boolean().default(false),
});

adminsRouter.post("/admins/:id/invite", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user!;
    const { id } = req.params;
    const body = generateInviteSchema.parse(req.body || {});
    
    const [admin] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!admin) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    await db.update(platformInvitations)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(
        eq(platformInvitations.targetUserId, id),
        eq(platformInvitations.status, "pending")
      ));
    
    const { randomBytes, createHash } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
    
    const [invite] = await db.insert(platformInvitations).values({
      email: admin.email,
      tokenHash,
      targetUserId: id,
      createdByUserId: actor.id,
      expiresAt,
      status: "pending",
    }).returning();
    
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const inviteUrl = `${baseUrl}/auth/platform-invite?token=${token}`;
    
    await db.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      targetUserId: id,
      eventType: "platform_admin_invite_generated",
      message: `Invite link generated for ${admin.email}`,
      metadata: { expiresAt: expiresAt.toISOString(), expiresInDays: body.expiresInDays },
    });
    
    let emailSent = false;
    if (body.sendEmail) {
      try {
        const { emailTemplateService } = await import("../../../services/emailTemplates");
        const { emailOutboxService } = await import("../../../services/emailOutbox");
        const templateVars = {
          userName: admin.name || admin.email,
          inviteUrl,
          expiryDays: String(body.expiresInDays),
          appName: "MyWorkDay",
        };
        const rendered = await emailTemplateService.renderByKey(null, "platform_admin_invite", templateVars);
        await emailOutboxService.sendEmail({
          tenantId: null,
          messageType: "platform_admin_invite",
          toEmail: admin.email,
          subject: rendered?.subject || "You've been invited as a Platform Administrator",
          textBody: rendered?.textBody || `You've been invited as a platform administrator.\n\nSet your password: ${inviteUrl}\n\nThis link expires in ${body.expiresInDays} day(s).`,
          htmlBody: rendered?.htmlBody,
          metadata: { inviteId: invite.id },
        });
        emailSent = true;

        await db.insert(platformAuditEvents).values({
          actorUserId: actor.id,
          targetUserId: id,
          eventType: "platform_admin_invite_emailed",
          message: `Invite email sent to ${admin.email}`,
        });
      } catch (emailError) {
        console.error("[admins] Failed to send invite email:", emailError);
      }
    }
    
    res.json({
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
      tokenMasked: `${token.substring(0, 8)}...`,
      emailSent,
      mailgunConfigured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors });
    }
    console.error("[admins] Failed to generate invite:", error);
    res.status(500).json({ error: "Failed to generate invite link" });
  }
});

adminsRouter.get("/admins/:id/audit-events", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const events = await db.select()
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.targetUserId, id))
      .orderBy(desc(platformAuditEvents.createdAt))
      .limit(limit);
    
    res.json(events);
  } catch (error) {
    console.error("[admins] Failed to get audit events:", error);
    res.status(500).json({ error: "Failed to get audit events" });
  }
});

const provisionPlatformAdminSchema = z.object({
  method: z.enum(["SET_PASSWORD", "RESET_LINK"]),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  mustChangeOnNextLogin: z.boolean().default(true),
  activateNow: z.boolean().default(true),
  sendEmail: z.boolean().default(false),
});

adminsRouter.post("/admins/:id/provision", requireSuperUser, async (req, res) => {
  const requestId = req.get("X-Request-Id") || `padmin-prov-${Date.now()}`;
  const debug = process.env.SUPER_USER_PROVISION_DEBUG === "true";
  
  try {
    const { id } = req.params;
    const data = provisionPlatformAdminSchema.parse(req.body);
    const actor = req.user!;
    
    if (debug) {
      console.log(`[platform-admin-provision] requestId=${requestId} adminId=${id} method=${data.method}`);
    }
    
    if (data.method === "SET_PASSWORD" && !data.password) {
      return res.status(400).json({ error: "Password is required when method is SET_PASSWORD", requestId });
    }
    
    const [admin] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!admin) {
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} FAIL: admin not found`);
      return res.status(404).json({ error: "Platform admin not found", requestId });
    }
    
    if (data.activateNow && !admin.isActive) {
      await db.update(users)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(users.id, id));
      
      await db.insert(platformAuditEvents).values({
        actorUserId: actor.id,
        targetUserId: id,
        eventType: "platform_admin_reactivated",
        message: `Platform admin ${admin.email} activated via provision`,
        metadata: { requestId },
      });
    }
    
    let resetUrl: string | undefined;
    let expiresAt: string | undefined;
    
    if (data.method === "SET_PASSWORD") {
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} setting password`);
      
      const { hashPassword } = await import("../../../auth");
      const passwordHash = await hashPassword(data.password!);
      
      await db.update(users)
        .set({ 
          passwordHash, 
          mustChangePasswordOnNextLogin: data.mustChangeOnNextLogin,
          updatedAt: new Date() 
        })
        .where(eq(users.id, id));
      
      const { passwordResetTokens } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, isNull: isNullOp } = await import("drizzle-orm");
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(andOp(
          eqOp(passwordResetTokens.userId, id),
          isNullOp(passwordResetTokens.usedAt)
        ));
      
      await db.update(platformInvitations)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(and(
          eq(platformInvitations.targetUserId, id),
          eq(platformInvitations.status, "pending")
        ));
      
      await db.insert(platformAuditEvents).values({
        actorUserId: actor.id,
        targetUserId: id,
        eventType: "platform_admin_password_set",
        message: `Password set for platform admin ${admin.email} via provision`,
        metadata: { requestId, mustChangeOnNextLogin: data.mustChangeOnNextLogin },
      });
      
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} password set successfully`);
      
      res.json({
        success: true,
        method: "SET_PASSWORD",
        adminId: id,
        email: admin.email,
        isActive: data.activateNow || admin.isActive,
        mustChangeOnNextLogin: data.mustChangeOnNextLogin,
        requestId,
      });
    } else if (data.method === "RESET_LINK") {
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} generating reset link`);
      
      const { passwordResetTokens } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, isNull: isNullOp } = await import("drizzle-orm");
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(andOp(
          eqOp(passwordResetTokens.userId, id),
          isNullOp(passwordResetTokens.usedAt)
        ));
      
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await db.insert(passwordResetTokens).values({
        userId: id,
        tokenHash,
        expiresAt: expiry,
        createdByUserId: actor.id,
      });
      
      const appPublicUrl = process.env.APP_PUBLIC_URL;
      if (!appPublicUrl && debug) {
        console.warn(`[platform-admin-provision] requestId=${requestId} APP_PUBLIC_URL not set`);
      }
      const baseUrl = appPublicUrl || `${req.protocol}://${req.get("host")}`;
      resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
      expiresAt = expiry.toISOString();
      
      await db.insert(platformAuditEvents).values({
        actorUserId: actor.id,
        targetUserId: id,
        eventType: "platform_admin_reset_link_generated",
        message: `Reset link generated for platform admin ${admin.email} via provision`,
        metadata: { requestId },
      });
      
      if (data.sendEmail) {
        try {
          const { emailTemplateService } = await import("../../../services/emailTemplates");
          const { emailOutboxService } = await import("../../../services/emailOutbox");
          const templateVars = {
            userName: admin.name || admin.email,
            userEmail: admin.email,
            resetUrl,
            expiryHours: "24",
            appName: "MyWorkDay",
          };
          const rendered = await emailTemplateService.renderByKey(null, "admin_password_reset", templateVars);
          await emailOutboxService.sendEmail({
            tenantId: null,
            messageType: "admin_password_reset",
            toEmail: admin.email,
            subject: rendered?.subject || "Reset Your Platform Admin Password",
            textBody: rendered?.textBody || `A password reset has been requested for your account.\n\nReset your password: ${resetUrl}\n\nThis link expires in 24 hours.`,
            htmlBody: rendered?.htmlBody,
            metadata: { adminId: id, requestId },
          });

          await db.insert(platformAuditEvents).values({
            actorUserId: actor.id,
            targetUserId: id,
            eventType: "platform_admin_reset_email_sent",
            message: `Reset email sent to platform admin ${admin.email}`,
            metadata: { requestId },
          });
        } catch (emailError) {
          console.error(`[platform-admin-provision] requestId=${requestId} Failed to send email:`, emailError);
        }
      }
      
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} reset link generated successfully`);
      
      res.json({
        success: true,
        method: "RESET_LINK",
        adminId: id,
        email: admin.email,
        isActive: data.activateNow || admin.isActive,
        resetUrl,
        expiresAt,
        requestId,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors, requestId });
    }
    console.error("[admins] Failed to provision platform admin:", error);
    res.status(500).json({ error: "Failed to provision platform admin", requestId });
  }
});
