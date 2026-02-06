import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { invitations, users, workspaceMembers } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { recordTenantAuditEvent } from '../../superAdmin';

export const tenantInvitationsRouter = Router();

tenantInvitationsRouter.get("/tenants/:tenantId/invitations", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantInvitations = await storage.getInvitationsByTenant(tenantId);
    
    // Note: inviteUrl is not included because we only store tokenHash, not raw tokens.
    // To get a copyable invite link, use the regenerate endpoint which returns a fresh token.
    res.json({
      invitations: tenantInvitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        usedAt: inv.usedAt,
      })),
      total: tenantInvitations.length,
    });
  } catch (error) {
    console.error("Error fetching tenant invitations:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

// POST /api/v1/super/tenants/:tenantId/invitations/:invitationId/activate - Manually activate a pending invitation
tenantInvitationsRouter.post("/tenants/:tenantId/invitations/:invitationId/activate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const { password } = req.body;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    // Get the invitation
    const [invitation] = await db.select().from(invitations)
      .where(and(
        eq(invitations.id, invitationId),
        eq(invitations.tenantId, tenantId)
      ));
    
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    if (invitation.status !== "pending") {
      return res.status(400).json({ error: `Invitation is already ${invitation.status}` });
    }
    
    // Check if user with this email already exists
    const existingUser = await storage.getUserByEmail(invitation.email);
    if (existingUser) {
      // If user exists for this tenant, just mark invitation as accepted
      if (existingUser.tenantId === tenantId) {
        await db.update(invitations)
          .set({ status: "accepted", usedAt: new Date() })
          .where(eq(invitations.id, invitationId));
        return res.json({ 
          message: "User already exists, invitation marked as accepted",
          user: existingUser 
        });
      }
      return res.status(409).json({ error: "A user with this email already exists in another tenant" });
    }
    
    // Hash password if provided, otherwise generate temporary one
    const { hashPassword } = await import("../../../auth");
    const crypto = await import("crypto");
    let passwordHash: string;
    let mustChangePassword = false;
    let tempPassword: string | undefined;
    
    if (password && password.length >= 8) {
      passwordHash = await hashPassword(password);
    } else {
      // Generate a temporary password
      tempPassword = crypto.randomBytes(12).toString("base64").slice(0, 16);
      passwordHash = await hashPassword(tempPassword);
      mustChangePassword = true;
    }
    
    // Get primary workspace for this tenant (required for user provisioning)
    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
    
    // Extract names from invitation if available - email parsing as fallback
    const firstName = invitation.email.split("@")[0];
    const lastName = "";
    
    // Use a transaction to ensure atomicity of user creation, workspace membership, and invitation update
    const newUser = await db.transaction(async (tx) => {
      // Create the user
      const [createdUser] = await tx.insert(users).values({
        email: invitation.email,
        name: firstName || invitation.email.split("@")[0],
        firstName,
        lastName,
        role: invitation.role || "employee",
        passwordHash,
        isActive: true,
        tenantId,
        mustChangePasswordOnNextLogin: mustChangePassword,
      }).returning();
      
      // Add to primary workspace
      await tx.insert(workspaceMembers).values({
        workspaceId: primaryWorkspaceId,
        userId: createdUser.id,
        role: invitation.role === "admin" ? "admin" : "member",
      }).onConflictDoNothing();
      
      // Mark invitation as accepted
      await tx.update(invitations)
        .set({ status: "accepted", usedAt: new Date() })
        .where(eq(invitations.id, invitationId));
      
      return createdUser;
    });
    
    // Log the action (outside transaction - best effort)
    await recordTenantAuditEvent(
      tenantId,
      "manually_activate_invitation",
      `Invitation for ${invitation.email} manually activated`,
      superUser?.id,
      { 
        email: invitation.email, 
        tenantId,
        userId: newUser.id,
        role: invitation.role 
      }
    );
    
    res.json({
      message: "Invitation activated successfully",
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        isActive: newUser.isActive,
      },
      tempPassword: mustChangePassword ? tempPassword : undefined,
      mustChangePassword,
    });
  } catch (error) {
    console.error("Error activating invitation:", error);
    res.status(500).json({ error: "Failed to activate invitation" });
  }
});

// POST /api/v1/super/tenants/:tenantId/invitations/activate-all - Activate all pending invitations for a tenant
tenantInvitationsRouter.post("/tenants/:tenantId/invitations/activate-all", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    // Get all pending invitations for this tenant
    const pendingInvitations = await db.select().from(invitations)
      .where(and(
        eq(invitations.tenantId, tenantId),
        eq(invitations.status, "pending")
      ));
    
    if (pendingInvitations.length === 0) {
      return res.json({ message: "No pending invitations to activate", activated: 0 });
    }
    
    // Get primary workspace for this tenant (required for user provisioning)
    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
    
    const { hashPassword } = await import("../../../auth");
    const crypto = await import("crypto");
    
    const results: any[] = [];
    const errors: any[] = [];
    
    for (const invitation of pendingInvitations) {
      try {
        // Check if user with this email already exists
        const existingUser = await storage.getUserByEmail(invitation.email);
        if (existingUser) {
          if (existingUser.tenantId === tenantId) {
            // Mark invitation as accepted since user exists
            await db.update(invitations)
              .set({ status: "accepted", usedAt: new Date() })
              .where(eq(invitations.id, invitation.id));
            results.push({ 
              email: invitation.email, 
              status: "already_exists", 
              userId: existingUser.id 
            });
          } else {
            errors.push({ 
              email: invitation.email, 
              error: "Email exists in another tenant" 
            });
          }
          continue;
        }
        
        // Generate a temporary password
        const tempPassword = crypto.randomBytes(12).toString("base64").slice(0, 16);
        const passwordHash = await hashPassword(tempPassword);
        
        // Extract names from invitation if available - use email parsing as fallback
        const firstName = invitation.email.split("@")[0];
        const lastName = "";
        
        // Create the user
        const newUser = await storage.createUserWithTenant({
          email: invitation.email,
          name: firstName || invitation.email.split("@")[0],
          firstName,
          lastName,
          role: invitation.role || "employee",
          passwordHash,
          isActive: true,
          tenantId,
          mustChangePasswordOnNextLogin: true,
        });
        
        // Add to primary workspace
        await db.insert(workspaceMembers).values({
          workspaceId: primaryWorkspaceId,
          userId: newUser.id,
          role: invitation.role === "admin" ? "admin" : "member",
        }).onConflictDoNothing();
        
        // Mark invitation as accepted
        await db.update(invitations)
          .set({ status: "accepted", usedAt: new Date() })
          .where(eq(invitations.id, invitation.id));
        
        results.push({
          email: invitation.email,
          status: "activated",
          userId: newUser.id,
          tempPassword,
        });
      } catch (err: any) {
        console.error(`Error activating invitation for ${invitation.email}:`, err);
        errors.push({ email: invitation.email, error: err.message });
      }
    }
    
    // Log the bulk action
    await recordTenantAuditEvent(
      superUser.id,
      "bulk_activate_invitations",
      `Bulk activated invitations for tenant ${tenantId}`,
      superUser?.id,
      { 
        totalPending: pendingInvitations.length,
        activated: results.filter(r => r.status === "activated").length,
        alreadyExisted: results.filter(r => r.status === "already_exists").length,
        errors: errors.length 
      }
    );
    
    res.json({
      message: `Activated ${results.filter(r => r.status === "activated").length} invitations`,
      results,
      errors,
    });
  } catch (error) {
    console.error("Error bulk activating invitations:", error);
    res.status(500).json({ error: "Failed to activate invitations" });
  }
});

tenantInvitationsRouter.post("/tenants/:tenantId/invitations/:invitationId/revoke", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const invitation = await storage.revokeInvitation(invitationId);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_revoked",
      `Invitation for ${invitation.email} revoked`,
      superUser?.id,
      { invitationId, email: invitation.email }
    );
    
    res.json({
      invitation,
      message: "Invitation revoked successfully",
    });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    res.status(500).json({ error: "Failed to revoke invitation" });
  }
});

// Resend invitation email (regenerates token first since we don't store raw tokens)
tenantInvitationsRouter.post("/tenants/:tenantId/invitations/:invitationId/resend", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const invitation = await storage.getInvitationById(invitationId);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Verify invitation belongs to this tenant
    if (invitation.tenantId !== tenantId) {
      return res.status(404).json({ error: "Invitation not found in this tenant" });
    }
    
    if (invitation.status !== "pending") {
      return res.status(400).json({ error: "Can only resend pending invitations" });
    }
    
    // Regenerate the token (since we don't store raw tokens, only hashes)
    const { invitation: updatedInvitation, token } = await storage.regenerateInvitation(invitationId, superUser?.id || "");
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    // Try to send email
    let emailSent = false;
    try {
      const { sendInviteEmail } = await import("../../../email");
      const tenantSettingsData = await storage.getTenantSettings(tenantId);
      const appName = tenantSettingsData?.appName || "MyWorkDay";
      
      await sendInviteEmail(invitation.email, inviteUrl, appName, tenantId);
      emailSent = true;
    } catch (emailError) {
      console.error("Failed to resend invitation email:", emailError);
    }
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_resent",
      `Invitation email ${emailSent ? "resent" : "resend attempted but failed"} to ${invitation.email}`,
      superUser?.id,
      { invitationId, email: invitation.email, emailSent }
    );
    
    res.json({
      inviteUrl,
      emailSent,
      message: emailSent ? "Invitation email resent successfully" : "Email sending failed. Copy the link manually.",
    });
  } catch (error) {
    console.error("Error resending invitation:", error);
    res.status(500).json({ error: "Failed to resend invitation" });
  }
});

// Regenerate invitation link (creates new token and extends expiry)
tenantInvitationsRouter.post("/tenants/:tenantId/invitations/:invitationId/regenerate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingInvitation = await storage.getInvitationById(invitationId);
    if (!existingInvitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Verify invitation belongs to this tenant
    if (existingInvitation.tenantId !== tenantId) {
      return res.status(404).json({ error: "Invitation not found in this tenant" });
    }
    
    if (existingInvitation.status === "accepted") {
      return res.status(400).json({ error: "Cannot regenerate an accepted invitation" });
    }
    
    // Regenerate the token using the storage method
    const { invitation: updatedInvitation, token } = await storage.regenerateInvitation(invitationId, superUser?.id || "");
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_regenerated",
      `Invitation link regenerated for ${existingInvitation.email}`,
      superUser?.id,
      { invitationId, email: existingInvitation.email }
    );
    
    res.json({
      invitation: updatedInvitation,
      inviteUrl,
      message: "Invitation link regenerated successfully",
    });
  } catch (error) {
    console.error("Error regenerating invitation:", error);
    res.status(500).json({ error: "Failed to regenerate invitation" });
  }
});

// Delete an invitation (only for revoked or expired invitations)
tenantInvitationsRouter.delete("/tenants/:tenantId/invitations/:invitationId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const invitation = await storage.getInvitationById(invitationId);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Verify invitation belongs to this tenant
    if (invitation.tenantId !== tenantId) {
      return res.status(404).json({ error: "Invitation not found in this tenant" });
    }
    
    // Only allow deletion of revoked or expired invitations
    const isExpired = new Date(invitation.expiresAt) < new Date();
    if (invitation.status !== "revoked" && !isExpired) {
      return res.status(400).json({ 
        error: "Can only delete revoked or expired invitations. Active pending invitations must be revoked first." 
      });
    }
    
    await storage.deleteInvitation(invitationId);
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_deleted",
      `Invitation for ${invitation.email} deleted permanently`,
      superUser?.id,
      { invitationId, email: invitation.email, previousStatus: invitation.status }
    );
    
    res.json({
      success: true,
      message: "Invitation deleted permanently",
    });
  } catch (error) {
    console.error("Error deleting invitation:", error);
    res.status(500).json({ error: "Failed to delete invitation" });
  }
});
