import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { hashPassword } from '../../../auth';
import { z } from 'zod';
import { eq, sql, and, isNull, ne, inArray } from 'drizzle-orm';
import {
  users,
  workspaces,
  workspaceMembers,
  invitations,
  tenantAuditEvents,
  UserRole,
  teamMembers,
  projectMembers,
  divisionMembers,
  taskAssignees,
  projects,
  timeEntries,
  activityLog,
  comments,
  passwordResetTokens,
  userUiPreferences,
} from '@shared/schema';
import { cleanupUserReferences } from '../../../utils/userDeletion';
import { tenantIntegrationService } from '../../../services/tenantIntegrations';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { recordTenantAuditEvent } from '../../superAdmin';

export const tenantUsersRouter = Router();

// =============================================================================
// GET /tenants/:tenantId/users - List all users for a tenant
// =============================================================================
tenantUsersRouter.get("/tenants/:tenantId/users", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantUsers = await storage.getUsersByTenant(tenantId);
    
    res.json({
      users: tenantUsers.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      total: tenantUsers.length,
    });
  } catch (error) {
    console.error("Error fetching tenant users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users - Create a new user in a tenant
// =============================================================================
const createUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["admin", "employee"]).default("employee"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isActive: z.boolean().default(true),
});

tenantUsersRouter.post("/tenants/:tenantId/users", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createUserSchema.parse(req.body);
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByEmail(data.email);
    if (existingUser) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    
    const passwordHash = await hashPassword(data.password);
    
    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
    
    const newUser = await storage.createUserWithTenant({
      email: data.email,
      name: `${data.firstName} ${data.lastName}`,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      passwordHash,
      isActive: data.isActive,
      tenantId,
    });
    
    await db.insert(workspaceMembers).values({
      workspaceId: primaryWorkspaceId,
      userId: newUser.id,
      role: data.role === "admin" ? "admin" : "member",
    }).onConflictDoNothing();

    if (data.role !== "client") {
      await storage.addUserToAllTenantProjects(newUser.id, tenantId);
    }
    
    await recordTenantAuditEvent(
      tenantId,
      "user_created",
      `User ${data.email} created manually`,
      superUser?.id,
      { email: data.email, role: data.role, isActive: data.isActive }
    );
    
    res.status(201).json({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      },
      message: "User created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/provision - Unified provisioning endpoint
// =============================================================================
const provisionUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  role: z.enum(["admin", "employee", "client"]).default("employee"),
  activateNow: z.boolean().default(true),
  method: z.enum(["SET_PASSWORD", "RESET_LINK"]),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  mustChangeOnNextLogin: z.boolean().default(true),
  sendEmail: z.boolean().default(false),
});

tenantUsersRouter.post("/tenants/:tenantId/users/provision", requireSuperUser, async (req, res) => {
  const requestId = req.get("X-Request-Id") || `prov-${Date.now()}`;
  const debug = process.env.SUPER_USER_PROVISION_DEBUG === "true";
  
  try {
    const { tenantId } = req.params;
    const data = provisionUserSchema.parse(req.body);
    const superUser = req.user!;
    
    if (debug) {
      console.log(`[provision-debug] requestId=${requestId} tenantId=${tenantId} email=${data.email} method=${data.method}`);
    }
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      if (debug) console.log(`[provision-debug] requestId=${requestId} FAIL: tenant not found`);
      return res.status(404).json({ error: "Tenant not found", requestId });
    }
    
    if (tenant.status === "deleted") {
      if (debug) console.log(`[provision-debug] requestId=${requestId} FAIL: tenant is deleted`);
      return res.status(400).json({ error: "Cannot provision users in a deleted tenant", requestId });
    }
    
    if (data.method === "SET_PASSWORD" && !data.password) {
      return res.status(400).json({ error: "Password is required when method is SET_PASSWORD", requestId });
    }
    
    const existingUserByEmail = await storage.getUserByEmailAndTenant(data.email, tenantId);
    let user: any;
    let isNewUser = false;
    
    if (existingUserByEmail) {
      if (debug) console.log(`[provision-debug] requestId=${requestId} found existing user id=${existingUserByEmail.id}`);
      
      const updates: any = {
        isActive: data.activateNow,
      };
      if (data.firstName) updates.firstName = data.firstName;
      if (data.lastName) updates.lastName = data.lastName;
      if (data.firstName || data.lastName) {
        updates.name = `${data.firstName || existingUserByEmail.firstName || ""} ${data.lastName || existingUserByEmail.lastName || ""}`.trim();
      }
      if (data.role) updates.role = data.role;
      
      user = await storage.updateUserWithTenant(existingUserByEmail.id, tenantId, updates);
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_updated",
        `User ${data.email} updated via provision`,
        superUser?.id,
        { userId: user.id, email: data.email, role: data.role, isActive: data.activateNow }
      );
    } else {
      if (debug) console.log(`[provision-debug] requestId=${requestId} creating new user`);
      
      const globalExisting = await storage.getUserByEmail(data.email);
      if (globalExisting) {
        if (debug) console.log(`[provision-debug] requestId=${requestId} FAIL: email exists in another tenant`);
        return res.status(409).json({ 
          error: "A user with this email already exists in another tenant", 
          requestId 
        });
      }
      
      const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
      
      user = await storage.createUserWithTenant({
        email: data.email,
        name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        role: data.role,
        passwordHash: null,
        isActive: data.activateNow,
        tenantId,
      });
      isNewUser = true;
      
      await db.insert(workspaceMembers).values({
        workspaceId: primaryWorkspaceId,
        userId: user.id,
        role: data.role === "admin" ? "admin" : "member",
      }).onConflictDoNothing();
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_created",
        `User ${data.email} created via provision`,
        superUser?.id,
        { userId: user.id, email: data.email, role: data.role, isActive: data.activateNow }
      );
    }
    
    let resetUrl: string | undefined;
    let expiresAt: string | undefined;
    
    if (data.method === "SET_PASSWORD") {
      if (debug) console.log(`[provision-debug] requestId=${requestId} setting password`);
      
      const pwHash = await hashPassword(data.password!);
      
      await storage.setUserPasswordWithMustChange(user.id, tenantId, pwHash, data.mustChangeOnNextLogin);
      
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt)
        ));
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_set_password",
        `Password set for user ${data.email} via provision`,
        superUser?.id,
        { userId: user.id, email: data.email, mustChangeOnNextLogin: data.mustChangeOnNextLogin }
      );
      
      if (debug) console.log(`[provision-debug] requestId=${requestId} password set successfully`);
    } else if (data.method === "RESET_LINK") {
      if (debug) console.log(`[provision-debug] requestId=${requestId} generating reset link`);
      
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt)
        ));
      
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: expiry,
        createdByUserId: superUser.id,
      });
      
      const appPublicUrl = process.env.APP_PUBLIC_URL;
      if (!appPublicUrl && debug) {
        console.warn(`[provision-debug] requestId=${requestId} APP_PUBLIC_URL not set`);
      }
      const baseUrl = appPublicUrl || `${req.protocol}://${req.get("host")}`;
      resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
      expiresAt = expiry.toISOString();
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_generated_reset_link",
        `Reset link generated for user ${data.email} via provision`,
        superUser?.id,
        { userId: user.id, email: data.email }
      );
      
      if (data.sendEmail) {
        try {
          const emailResult = await sendProvisionResetEmail(tenantId, user.email, resetUrl, tenant.name);
          if (debug) console.log(`[provision-debug] requestId=${requestId} email sent=${emailResult}`);
        } catch (emailError) {
          if (debug) console.log(`[provision-debug] requestId=${requestId} email failed:`, emailError);
        }
      }
      
      if (debug) console.log(`[provision-debug] requestId=${requestId} reset link generated`);
    }
    
    const finalUser = await storage.getUserByIdAndTenant(user.id, tenantId);
    
    res.json({
      ok: true,
      user: {
        id: finalUser?.id,
        email: finalUser?.email,
        firstName: finalUser?.firstName,
        lastName: finalUser?.lastName,
        role: finalUser?.role,
        isActive: finalUser?.isActive,
        mustChangeOnNextLogin: finalUser?.mustChangePasswordOnNextLogin,
        lastLoginAt: finalUser?.lastLoginAt,
      },
      isNewUser,
      resetUrl,
      expiresAt,
      requestId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors, requestId });
    }
    console.error(`[provision-error] requestId=${requestId}`, error);
    res.status(500).json({ error: "Failed to provision user", requestId });
  }
});

async function sendProvisionResetEmail(tenantId: string, email: string, resetUrl: string, tenantName: string): Promise<boolean> {
  try {
    const { emailTemplateService } = await import("../../../services/emailTemplates");
    const { emailOutboxService } = await import("../../../services/emailOutbox");
    const templateVars = {
      userName: email,
      userEmail: email,
      tenantName,
      resetUrl,
      expiryHours: "24",
      appName: "MyWorkDay",
    };
    const rendered = await emailTemplateService.renderByKey(tenantId, "user_provision", templateVars);
    await emailOutboxService.sendEmail({
      tenantId,
      messageType: "user_provision",
      toEmail: email,
      subject: rendered?.subject || `Set Your Password for ${tenantName}`,
      textBody: rendered?.textBody || `Your account on ${tenantName} has been created.\n\nSet your password: ${resetUrl}\n\nThis link expires in 24 hours.`,
      htmlBody: rendered?.htmlBody,
      metadata: { tenantId, email },
    });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// POST /tenants/:tenantId/users/fix-tenant-ids - Backfill missing tenantId
// =============================================================================
tenantUsersRouter.post("/tenants/:tenantId/users/fix-tenant-ids", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantWorkspaces = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    if (tenantWorkspaces.length === 0) {
      return res.json({ message: "No workspaces found for this tenant", fixed: 0 });
    }
    
    const workspaceIds = tenantWorkspaces.map(w => w.id);
    
    const usersToFix = await db.select({
      userId: workspaceMembers.userId,
      user: users,
    })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(
        inArray(workspaceMembers.workspaceId, workspaceIds),
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER),
      ));
    
    let fixedCount = 0;
    for (const row of usersToFix) {
      await db.update(users)
        .set({ tenantId, updatedAt: new Date() })
        .where(eq(users.id, row.userId));
      fixedCount++;
      
      console.log(`[fix-tenant-ids] Fixed user ${row.user.email} -> tenantId: ${tenantId}`);
    }
    
    const inviteEmails = await db.select({
      email: invitations.email,
    })
      .from(invitations)
      .where(and(
        eq(invitations.tenantId, tenantId),
        eq(invitations.status, "accepted")
      ));
    
    for (const row of inviteEmails) {
      const [matchedUser] = await db.select()
        .from(users)
        .where(and(
          eq(users.email, row.email),
          isNull(users.tenantId),
          ne(users.role, UserRole.SUPER_USER),
        ))
        .limit(1);
      
      if (matchedUser) {
        await db.update(users)
          .set({ tenantId, updatedAt: new Date() })
          .where(eq(users.id, matchedUser.id));
        fixedCount++;
        
        console.log(`[fix-tenant-ids] Fixed invited user ${matchedUser.email} -> tenantId: ${tenantId}`);
      }
    }
    
    await recordTenantAuditEvent(
      tenantId,
      "super_fix_tenant_ids",
      `Fixed ${fixedCount} users with missing tenantId`,
      superUser?.id,
      { fixedCount }
    );
    
    res.json({
      message: `Fixed ${fixedCount} users with missing tenantId`,
      fixed: fixedCount,
      tenantId,
      tenantName: tenant.name,
    });
  } catch (error: any) {
    console.error("[fix-tenant-ids] Error:", error);
    res.status(500).json({ 
      error: "Failed to fix tenant IDs",
      details: error?.message || "Unknown error",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined
    });
  }
});

// =============================================================================
// PATCH /tenants/:tenantId/users/:userId - Update a tenant user
// =============================================================================
const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "employee", "client"]).optional(),
  isActive: z.boolean().optional(),
});

tenantUsersRouter.patch("/tenants/:tenantId/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const data = updateUserSchema.parse(req.body);
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const updates: any = {};
    if (data.email) updates.email = data.email;
    if (data.firstName !== undefined) {
      updates.firstName = data.firstName;
      updates.name = `${data.firstName} ${data.lastName || existingUser.lastName || ""}`.trim();
    }
    if (data.lastName !== undefined) {
      updates.lastName = data.lastName;
      updates.name = `${data.firstName || existingUser.firstName || ""} ${data.lastName}`.trim();
    }
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    
    const updatedUser = await storage.updateUserWithTenant(userId, tenantId, updates);
    
    await recordTenantAuditEvent(
      tenantId,
      "user_updated",
      `User ${existingUser.email} updated`,
      superUser?.id,
      { userId, changes: data }
    );
    
    res.json({
      user: updatedUser,
      message: "User updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/activate - Activate/deactivate a user
// =============================================================================
tenantUsersRouter.post("/tenants/:tenantId/users/:userId/activate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const updatedUser = await storage.setUserActiveWithTenant(userId, tenantId, isActive);
    
    await recordTenantAuditEvent(
      tenantId,
      isActive ? "user_activated" : "user_deactivated",
      `User ${existingUser.email} ${isActive ? "activated" : "deactivated"}`,
      superUser?.id,
      { userId, email: existingUser.email }
    );
    
    res.json({
      user: updatedUser,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating user activation:", error);
    res.status(500).json({ error: "Failed to update user activation" });
  }
});

// =============================================================================
// DELETE /tenants/:tenantId/users/:userId - Permanently delete a tenant user
// =============================================================================
tenantUsersRouter.delete("/tenants/:tenantId/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    if (existingUser.isActive) {
      return res.status(400).json({ 
        error: "Cannot delete active user",
        details: "User must be suspended (deactivated) before deletion. Deactivate the user first, then try again."
      });
    }
    
    const actorId = superUser?.id;
    if (!actorId) {
      return res.status(401).json({ error: "Actor identity required for user deletion" });
    }
    await db.transaction(async (tx) => {
      await cleanupUserReferences(tx, userId, actorId);
      await tx.delete(invitations).where(eq(invitations.email, existingUser.email));
      await tx.delete(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    });
    
    await recordTenantAuditEvent(
      tenantId,
      "user_deleted",
      `User ${existingUser.email} permanently deleted`,
      superUser?.id,
      { userId, email: existingUser.email, deletedAt: new Date().toISOString() }
    );
    
    console.log(`[SuperAdmin] User ${existingUser.email} deleted from tenant ${tenantId} by ${superUser?.email}`);
    
    res.json({
      message: `User ${existingUser.email} has been permanently deleted`,
      deletedUser: {
        id: userId,
        email: existingUser.email,
        name: existingUser.name,
      },
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/set-password - Set user password
// =============================================================================
const setPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

tenantUsersRouter.post("/tenants/:tenantId/users/:userId/set-password", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { password } = setPasswordSchema.parse(req.body);
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const pwHash = await hashPassword(password);
    
    await storage.setUserPasswordWithTenant(userId, tenantId, pwHash);
    
    await recordTenantAuditEvent(
      tenantId,
      "user_password_set",
      `Password set for user ${existingUser.email}`,
      superUser?.id,
      { userId, email: existingUser.email }
    );
    
    res.json({
      message: "Password set successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error setting user password:", error);
    res.status(500).json({ error: "Failed to set password" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/impersonate-login - Impersonate a user
// =============================================================================
tenantUsersRouter.post("/tenants/:tenantId/users/:userId/impersonate-login", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    if (tenant.status === "deleted" || tenant.status === "suspended") {
      return res.status(400).json({ error: `Cannot impersonate users in a ${tenant.status} tenant` });
    }
    
    const targetUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    if (!targetUser.isActive) {
      return res.status(400).json({ error: "Cannot impersonate an inactive user" });
    }
    
    await recordTenantAuditEvent(
      tenantId,
      "super_impersonate_user",
      `Super admin started impersonation of user ${targetUser.email}`,
      superUser?.id,
      { 
        targetUserId: userId, 
        targetEmail: targetUser.email,
        superAdminId: superUser?.id,
        superAdminEmail: superUser?.email
      }
    );
    
    (req.session as any).isImpersonatingUser = true;
    (req.session as any).impersonatedUserId = targetUser.id;
    (req.session as any).impersonatedUserEmail = targetUser.email;
    (req.session as any).impersonatedUserRole = targetUser.role;
    (req.session as any).impersonatedTenantId = tenantId;
    (req.session as any).impersonatedTenantName = tenant.name;
    (req.session as any).originalSuperUserId = superUser.id;
    (req.session as any).originalSuperUserEmail = superUser.email;
    (req.session as any).impersonationStartedAt = new Date().toISOString();
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log(`[impersonate] Super admin ${superUser.email} now impersonating ${targetUser.email} in tenant ${tenant.name}`);
    
    res.json({
      ok: true,
      impersonating: {
        userId: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
        tenantId,
        tenantName: tenant.name,
      },
      message: `Now impersonating ${targetUser.email}. You will see the app as this user sees it.`,
    });
  } catch (error) {
    console.error("Error impersonating user:", error);
    res.status(500).json({ error: "Failed to start impersonation" });
  }
});

// =============================================================================
// GET /tenants/:tenantId/users/:userId/invitation - Get invitation status
// =============================================================================
tenantUsersRouter.get("/tenants/:tenantId/users/:userId/invitation", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const user = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!user) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const invitation = await storage.getLatestInvitationByUserEmail(user.email, tenantId);
    
    res.json({
      invitation: invitation || null,
      hasAcceptedInvitation: !!user.passwordHash,
    });
  } catch (error) {
    console.error("Error getting user invitation:", error);
    res.status(500).json({ error: "Failed to get invitation status" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/regenerate-invite - Regenerate invitation
// =============================================================================
tenantUsersRouter.post("/tenants/:tenantId/users/:userId/regenerate-invite", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const user = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!user) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const existingInvitation = await storage.getLatestInvitationByUserEmail(user.email, tenantId);
    if (!existingInvitation) {
      return res.status(404).json({ error: "No invitation found for this user. Create a new invitation instead." });
    }
    
    const { invitation, token } = await storage.regenerateInvitation(existingInvitation.id, superUser?.id);
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    await recordTenantAuditEvent(
      tenantId,
      "invite_regenerated",
      `Invitation regenerated for ${user.email}`,
      superUser?.id,
      { userId, email: user.email, invitationId: invitation.id }
    );
    
    res.json({
      invitation,
      inviteUrl,
      message: "Invitation regenerated successfully",
    });
  } catch (error) {
    console.error("Error regenerating invitation:", error);
    res.status(500).json({ error: "Failed to regenerate invitation" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/send-invite - Send invitation email
// =============================================================================
tenantUsersRouter.post("/tenants/:tenantId/users/:userId/send-invite", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const user = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!user) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const existingInvitation = await storage.getLatestInvitationByUserEmail(user.email, tenantId);
    if (!existingInvitation) {
      return res.status(404).json({ error: "No invitation found for this user. Create a new invitation first." });
    }
    
    if (existingInvitation.status === "expired" || 
        (existingInvitation.expiresAt && new Date(existingInvitation.expiresAt) < new Date())) {
      return res.status(400).json({ error: "Invitation has expired. Please regenerate the invitation first." });
    }
    
    if (existingInvitation.status === "accepted" || existingInvitation.usedAt) {
      return res.status(400).json({ error: "This invitation has already been used." });
    }
    
    const { invitation, token } = await storage.regenerateInvitation(existingInvitation.id, superUser?.id);
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    let emailSent = false;
    try {
      const { sendInviteEmail } = await import("../../../email");
      const tenantSettingsData = await storage.getTenantSettings(tenantId);
      const appName = tenantSettingsData?.appName || "MyWorkDay";
      
      await sendInviteEmail(user.email, inviteUrl, appName, tenantId);
      emailSent = true;
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }
    
    await recordTenantAuditEvent(
      tenantId,
      "invite_sent",
      `Invitation email ${emailSent ? "sent" : "attempted but failed"} to ${user.email}`,
      superUser?.id,
      { userId, email: user.email, invitationId: invitation.id, emailSent }
    );
    
    res.json({
      invitation,
      inviteUrl,
      emailSent,
      message: emailSent ? "Invitation email sent successfully" : "Invitation regenerated but email sending failed",
    });
  } catch (error) {
    console.error("Error sending invitation:", error);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/reset-password - Reset user password
// =============================================================================
const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  mustChangeOnNextLogin: z.boolean().optional().default(true),
});

tenantUsersRouter.post("/tenants/:tenantId/users/:userId/reset-password", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { password, mustChangeOnNextLogin } = resetPasswordSchema.parse(req.body);
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    console.log(`Password reset attempt for user: ${existingUser.email} (id: ${userId}, tenantId: ${tenantId}, userTenantId: ${existingUser.tenantId})`);
    
    const pwHash = await hashPassword(password);
    
    const updatedUser = await storage.setUserPasswordWithMustChange(userId, tenantId, pwHash, mustChangeOnNextLogin);
    
    if (!updatedUser) {
      console.error(`Password reset failed: No user updated for userId=${userId}, tenantId=${tenantId}, userTenantId=${existingUser.tenantId}`);
      return res.status(500).json({ 
        error: "Failed to update password. Database update returned no results.",
        details: `User ${existingUser.email} found but update failed. This may indicate a tenantId mismatch.`
      });
    }
    
    console.log(`Password reset successful for user ${updatedUser.email} (id: ${userId})`);
    
    try {
      await db.execute(
        sql`DELETE FROM user_sessions WHERE sess::text LIKE ${'%"passport":{"user":"' + userId + '"%'}`
      );
    } catch (sessionError) {
      console.warn("Could not invalidate user sessions:", sessionError);
    }
    
    await recordTenantAuditEvent(
      tenantId,
      "user_password_reset",
      `Password reset for user ${existingUser.email}${mustChangeOnNextLogin ? " (must change on next login)" : ""} - sessions invalidated`,
      superUser?.id,
      { userId, email: existingUser.email, mustChangeOnNextLogin }
    );
    
    res.json({
      message: "Password reset successfully. User will need to log in again.",
      mustChangeOnNextLogin,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error resetting user password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/generate-reset-link - Generate reset link
// =============================================================================
tenantUsersRouter.post("/tenants/:tenantId/users/:userId/generate-reset-link", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user!;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(
        eq(passwordResetTokens.userId, existingUser.id),
        isNull(passwordResetTokens.usedAt)
      ));
    
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await db.insert(passwordResetTokens).values({
      userId: existingUser.id,
      tokenHash,
      expiresAt,
      createdByUserId: superUser.id,
    });
    
    const appPublicUrl = process.env.APP_PUBLIC_URL;
    if (!appPublicUrl) {
      console.warn("[generate-reset-link] APP_PUBLIC_URL not set, link may be incorrect behind proxy");
    }
    const baseUrl = appPublicUrl || `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
    
    await recordTenantAuditEvent(
      tenantId,
      "password_reset_link_generated",
      `Password reset link generated for user ${existingUser.email}`,
      superUser?.id,
      { userId, email: existingUser.email }
    );
    
    res.json({
      resetUrl,
      expiresAt: expiresAt.toISOString(),
      message: "Password reset link generated successfully. The link expires in 24 hours.",
    });
  } catch (error) {
    console.error("Error generating password reset link:", error);
    res.status(500).json({ error: "Failed to generate password reset link" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/import-users - Bulk import users
// =============================================================================
const csvUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(["admin", "employee"]).optional().default("employee"),
});

const bulkImportSchema = z.object({
  users: z.array(csvUserSchema).min(1, "At least one user is required").max(500, "Maximum 500 users per import"),
  expiresInDays: z.number().min(1).max(30).optional(),
  sendInvite: z.boolean().optional().default(false),
  workspaceName: z.string().min(1).optional(),
});

interface ImportResult {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  success: boolean;
  inviteUrl?: string;
  emailSent?: boolean;
  error?: string;
}

tenantUsersRouter.post("/tenants/:tenantId/import-users", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const data = bulkImportSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let workspaceId: string;
    const targetWorkspaceName = data.workspaceName || `${tenant.name} Workspace`;
    const allWorkspaces = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenantId));
    const tenantWorkspace = allWorkspaces.find(w => w.name === targetWorkspaceName) 
      || allWorkspaces.find(w => w.isPrimary === true)
      || allWorkspaces[0];
    
    if (tenantWorkspace) {
      workspaceId = tenantWorkspace.id;
    } else {
      const [newWorkspace] = await db.insert(workspaces).values({
        name: targetWorkspaceName,
        tenantId,
        isPrimary: true,
      }).returning();
      workspaceId = newWorkspace.id;
    }

    const superUser = req.user!;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const results: ImportResult[] = [];

    const existingEmails = new Set(
      (await db.select({ email: users.email }).from(users))
        .map(u => u.email.toLowerCase())
    );

    for (const user of data.users) {
      const emailLower = user.email.toLowerCase();
      
      if (existingEmails.has(emailLower)) {
        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: false,
          error: "Email already exists in the system",
        });
        continue;
      }

      try {
        const { invitation, token } = await storage.createTenantAdminInvitation({
          tenantId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          expiresInDays: data.expiresInDays,
          createdByUserId: superUser.id,
          workspaceId,
        });

        if (user.role === "employee") {
          await db.update(invitations)
            .set({ role: "employee" })
            .where(eq(invitations.id, invitation.id));
        }

        const inviteUrl = `${baseUrl}/invite/${token}`;

        let emailSent = false;
        if (data.sendInvite) {
          try {
            const mailgunIntegration = await tenantIntegrationService.getIntegration(tenantId, "mailgun");
            if (mailgunIntegration?.status === "configured" && mailgunIntegration.publicConfig) {
              const publicConfig = mailgunIntegration.publicConfig as { domain?: string; fromEmail?: string };
              const secretConfig = await tenantIntegrationService.getDecryptedSecrets(tenantId, "mailgun") as { apiKey?: string } | null;
              
              if (publicConfig.domain && secretConfig?.apiKey) {
                const mailgun = new Mailgun(FormData);
                const mg = mailgun.client({ username: "api", key: secretConfig.apiKey });
                
                const tenantSettingsData = await storage.getTenantSettings(tenantId);
                const appName = tenantSettingsData?.appName || tenantSettingsData?.displayName || "MyWorkDay";
                const recipientName = user.firstName || user.email.split("@")[0];
                
                await mg.messages.create(publicConfig.domain, {
                  from: publicConfig.fromEmail || `noreply@${publicConfig.domain}`,
                  to: user.email,
                  subject: `You've been invited to join ${appName}`,
                  html: `
                    <h2>Welcome to ${appName}</h2>
                    <p>Hi ${recipientName},</p>
                    <p>You've been invited to join ${appName}. Click the link below to accept your invitation:</p>
                    <p><a href="${inviteUrl}">Accept Invitation</a></p>
                    <p>This invitation expires in 7 days.</p>
                  `,
                });
                emailSent = true;
              }
            }
          } catch (emailErr) {
            console.error(`Failed to send invite email to ${user.email}:`, emailErr);
          }
        }

        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: true,
          inviteUrl,
          emailSent,
        });
      } catch (err) {
        console.error(`Error creating invitation for ${user.email}:`, err);
        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: false,
          error: "Failed to create invitation",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const emailsSent = results.filter(r => r.emailSent).length;

    await recordTenantAuditEvent(
      tenantId,
      "bulk_users_imported",
      `Bulk import: ${successCount} users imported, ${failCount} failed${data.sendInvite ? `, ${emailsSent} emails sent` : ''}`,
      superUser.id,
      { totalProcessed: data.users.length, successCount, failCount, emailsSent, sendInvite: data.sendInvite }
    );

    res.status(201).json({
      message: `Imported ${successCount} user(s) successfully. ${failCount} failed.`,
      totalProcessed: data.users.length,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error importing users:", error);
    res.status(500).json({ error: "Failed to import users" });
  }
});

// =============================================================================
// GET /tenants/:tenantId/users/:userId/workspaces - Get user workspace memberships
// =============================================================================
tenantUsersRouter.get("/tenants/:tenantId/users/:userId/workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }

    const tenantWorkspaces = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenantId));

    const memberships = await db.select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      createdAt: workspaceMembers.createdAt,
      workspaceName: workspaces.name,
    })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(
        eq(workspaceMembers.userId, userId),
        eq(workspaces.tenantId, tenantId),
      ));

    res.json({
      memberships,
      availableWorkspaces: tenantWorkspaces.map(w => ({ id: w.id, name: w.name, isPrimary: w.isPrimary })),
    });
  } catch (error) {
    console.error("Error fetching user workspaces:", error);
    res.status(500).json({ error: "Failed to fetch workspace data" });
  }
});

// =============================================================================
// POST /tenants/:tenantId/users/:userId/assign-workspace - Assign user to workspace
// =============================================================================
const assignWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  role: z.string().optional().default("member"),
});

tenantUsersRouter.post("/tenants/:tenantId/users/:userId/assign-workspace", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { workspaceId, role } = assignWorkspaceSchema.parse(req.body);
    const superUser = req.user!;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }

    const [workspace] = await db.select().from(workspaces).where(
      and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId))
    );
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found in this tenant" });
    }

    const [existingMember] = await db.select().from(workspaceMembers).where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
    );

    if (existingMember) {
      return res.status(409).json({ error: "User is already a member of this workspace" });
    }

    const [membership] = await db.insert(workspaceMembers).values({
      workspaceId,
      userId,
      role,
      status: "active",
    }).returning();

    await recordTenantAuditEvent(
      tenantId,
      "user_workspace_assigned",
      `User ${existingUser.email} assigned to workspace "${workspace.name}" with role "${role}"`,
      superUser.id,
      { userId, workspaceId, workspaceName: workspace.name, role }
    );

    res.json({
      message: `User assigned to workspace "${workspace.name}" successfully`,
      membership,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error assigning user to workspace:", error);
    res.status(500).json({ error: "Failed to assign workspace" });
  }
});

// =============================================================================
// DELETE /tenants/:tenantId/users/:userId/workspaces/:workspaceId - Remove user from workspace
// =============================================================================
tenantUsersRouter.delete("/tenants/:tenantId/users/:userId/workspaces/:workspaceId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId, workspaceId } = req.params;
    const superUser = req.user!;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }

    const [workspace] = await db.select().from(workspaces).where(
      and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId))
    );
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const [deleted] = await db.delete(workspaceMembers).where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
    ).returning();

    if (!deleted) {
      return res.status(404).json({ error: "User is not a member of this workspace" });
    }

    await recordTenantAuditEvent(
      tenantId,
      "user_workspace_removed",
      `User ${existingUser.email} removed from workspace "${workspace.name}"`,
      superUser.id,
      { userId, workspaceId, workspaceName: workspace.name }
    );

    res.json({ message: `User removed from workspace "${workspace.name}"` });
  } catch (error) {
    console.error("Error removing user from workspace:", error);
    res.status(500).json({ error: "Failed to remove from workspace" });
  }
});
