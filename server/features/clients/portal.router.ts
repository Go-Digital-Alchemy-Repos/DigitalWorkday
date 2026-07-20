import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { InvitationStatus, UserRole, ClientAccessLevel } from "@shared/schema";
import { hasTenantAdminAccess } from "@shared/roles";
import type { Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "crypto";
import { hashPassword } from "../../auth";
import { handleRouteError, AppError } from "../../lib/errors";
import { buildAppUrl } from "../../lib/appLinks";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

function isClientUser(req: Request): boolean {
  return req.user?.role === UserRole.CLIENT;
}

function isTenantAdmin(req: Request): boolean {
  return hasTenantAdminAccess(req.user?.role);
}

const router = Router();

function requireTenantAdminAccess(req: Request, _res: Response, next: NextFunction) {
  if (!isTenantAdmin(req)) {
    throw AppError.forbidden("Tenant admin access is required to manage client portal users");
  }
  next();
}

// Generate secure invite token
function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

// Hash token for storage (for security, don't store raw token)
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// =============================================================================
// CLIENT USER MANAGEMENT ROUTES (for tenant admins/employees)
// =============================================================================

// Get all client users for a specific client
router.get("/:clientId/users", requireTenantAdminAccess, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    
    // Verify client belongs to tenant
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        throw AppError.notFound("Client");
      }
    }
    
    const clientUsers = await storage.getClientUsers(clientId);
    res.json(clientUsers);
  } catch (error) {
    return handleRouteError(res, error, "GET /:clientId/users", req);
  }
});

// Invite a contact to become a client portal user
router.post("/:clientId/users/invite", requireTenantAdminAccess, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    const { contactId, accessLevel = ClientAccessLevel.VIEWER, sendEmail = true } = req.body;
    
    // Validate request
    if (!contactId) {
      throw AppError.badRequest("Contact ID is required");
    }
    
    // Verify client belongs to tenant
    const client = tenantId 
      ? await storage.getClientByIdAndTenant(clientId, tenantId)
      : await storage.getClient(clientId);
    
    if (!client) {
      throw AppError.notFound("Client");
    }
    
    // Get the contact
    const contact = await storage.getClientContact(contactId);
    if (!contact || contact.clientId !== clientId) {
      throw AppError.notFound("Contact");
    }
    
    if (!contact.email) {
      throw AppError.badRequest("Contact must have an email address");
    }
    
    // Check if user already exists with this email
    let existingUser = await storage.getUserByEmail(contact.email);
    
    if (existingUser) {
      if (existingUser.role !== UserRole.CLIENT) {
        throw AppError.conflict("This email belongs to an internal account and cannot be granted client portal access");
      }

      if (existingUser.tenantId && existingUser.tenantId !== client.tenantId) {
        throw AppError.conflict("This email belongs to a client user in another organization");
      }

      // Check if already has access to this client
      const existingAccess = await storage.getClientUserAccessByUserAndClient(
        existingUser.id, 
        clientId
      );
      
      if (existingAccess) {
        throw AppError.conflict("User already has access to this client");
      }
      
      // Grant access to existing user
      const access = await storage.addClientUserAccess({
        workspaceId: client.workspaceId,
        clientId,
        userId: existingUser.id,
        accessLevel,
      });
      
      return res.status(201).json({
        message: "Access granted to existing user",
        access,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
        },
      });
    }
    
    // Generate invite token for new user
    const token = generateInviteToken();
    const tokenHash = hashToken(token);
    
    const invitation = await storage.createInvitation({
      tenantId: client.tenantId,
      workspaceId: client.workspaceId,
      email: contact.email,
      role: UserRole.CLIENT,
      clientId,
      tokenHash,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdByUserId: getCurrentUserId(req),
    });

    // Keep the client invite audit trail in sync while the portal invite UI is being completed.
    const invite = await storage.createClientInvite({
      clientId,
      contactId,
      email: contact.email,
      roleHint: accessLevel,
      status: InvitationStatus.PENDING,
      tokenPlaceholder: tokenHash,
    });

    const registrationUrl = buildAppUrl(`/accept-invite/${token}`, req);
    let emailSent = false;
    let emailError: string | null = null;

    if (sendEmail) {
      try {
        const invitedBy = req.user?.name || req.user?.email || "Your administrator";
        const tenant = client.tenantId ? await storage.getTenant(client.tenantId) : null;
        const organizationName = tenant?.name || client.companyName;
        const { emailOutboxService } = await import("../../services/emailOutbox");
        const { emailTemplateService } = await import("../../services/emailTemplates");
        const templateVars: Record<string, string> = {
          userName: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email,
          invitedByName: invitedBy,
          tenantName: organizationName,
          inviteUrl: registrationUrl,
          role: "Client Portal User",
          expiryDays: "7",
          appName: "MyWorkDay",
          actionUrl: registrationUrl,
          actionLabel: "Accept Invitation",
        };

        const rendered = await emailTemplateService.renderByKey(client.tenantId, "invitation", templateVars);
        const result = await emailOutboxService.sendEmail({
          tenantId: client.tenantId,
          messageType: "invitation",
          toEmail: contact.email,
          subject: rendered?.subject || `You've been invited to ${organizationName}`,
          textBody: rendered?.textBody || `You've been invited to access the ${client.companyName} client portal for ${organizationName}.\n\nAccept your invitation: ${registrationUrl}`,
          htmlBody: rendered?.htmlBody || `<p>You've been invited to access the <strong>${client.companyName}</strong> client portal for <strong>${organizationName}</strong>.</p><p><a href="${registrationUrl}">Accept Invitation</a></p>`,
          actionUrl: registrationUrl,
          actionLabel: "Accept Invitation",
          requestId: req.requestId,
          metadata: {
            invitationId: invitation.id,
            clientInviteId: invite.id,
            clientId,
            contactId,
            accessLevel,
          },
        });

        emailSent = result.success;
        if (!result.success) {
          emailError = result.error || "Email provider did not accept the invite email.";
        }
      } catch (error: any) {
        emailError = error?.message || "Failed to send invite email.";
        console.error("[client-portal] Failed to send portal invitation email:", error);
      }
    }

    // Return the invite with token/link (only time raw token is exposed)
    res.status(201).json({
      message: emailSent
        ? "Invitation created and email sent"
        : "Invitation created; copy the invite link to send manually",
      invite: {
        id: invitation.id,
        legacyClientInviteId: invite.id,
        email: invite.email,
        status: invitation.status,
        createdAt: invitation.createdAt,
      },
      registrationUrl,
      token, // Include token for sending via email
      emailSent,
      emailError,
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /:clientId/users/invite", req);
  }
});

// Create a client portal user directly (with password, no invite flow)
router.post("/:clientId/users/create", requireTenantAdminAccess, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;

    const schema = z.object({
      email: z.string().email("Valid email is required"),
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().optional().default(""),
      password: z.string().min(8, "Password must be at least 8 characters"),
      accessLevel: z.enum(["viewer", "collaborator"]).default("viewer"),
    });

    const data = schema.parse(req.body);

    const client = tenantId
      ? await storage.getClientByIdAndTenant(clientId, tenantId)
      : await storage.getClient(clientId);

    if (!client) {
      throw AppError.notFound("Client");
    }

    const existingUser = await storage.getUserByEmail(data.email);
    if (existingUser) {
      const existingAccess = await storage.getClientUserAccessByUserAndClient(
        existingUser.id,
        clientId
      );
      if (existingAccess) {
        throw AppError.conflict("A user with this email already has access to this client");
      }
      throw AppError.conflict("A user with this email already exists. Use the invite flow to grant them access.");
    }

    const passwordHash = await hashPassword(data.password);

    const user = await storage.createUser({
      tenantId: client.tenantId,
      email: data.email,
      name: `${data.firstName} ${data.lastName}`.trim(),
      firstName: data.firstName,
      lastName: data.lastName || null,
      passwordHash,
      role: UserRole.CLIENT,
      isActive: true,
    });

    await storage.addClientUserAccess({
      workspaceId: client.workspaceId,
      clientId,
      userId: user.id,
      accessLevel: data.accessLevel as "viewer" | "collaborator",
    });

    res.status(201).json({
      message: "Portal user created successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    return handleRouteError(res, error, "POST /:clientId/users/create", req);
  }
});

// Update client user (access level, name, and optionally password)
router.patch("/:clientId/users/:userId", requireTenantAdminAccess, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId, userId } = req.params;

    const schema = z.object({
      accessLevel: z.enum(["viewer", "collaborator"]).optional(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().optional(),
      password: z.string().min(8, "Password must be at least 8 characters").optional(),
    }).refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    });

    const data = schema.parse(req.body);

    // Verify client belongs to tenant
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        throw AppError.notFound("Client");
      }
    }

    const existingUser = await storage.getUser(userId);
    if (!existingUser || existingUser.role !== UserRole.CLIENT) {
      throw AppError.notFound("Portal user");
    }

    const existingAccess = await storage.getClientUserAccessByUserAndClient(userId, clientId);
    if (!existingAccess) {
      throw AppError.notFound("Client user access");
    }

    if (data.accessLevel) {
      const access = await storage.updateClientUserAccess(clientId, userId, { accessLevel: data.accessLevel });
      if (!access) {
        throw AppError.notFound("Client user access");
      }
    }

    const userUpdates: Record<string, any> = {};
    if (data.firstName !== undefined) {
      userUpdates.firstName = data.firstName;
      userUpdates.name = `${data.firstName} ${data.lastName ?? existingUser.lastName ?? ""}`.trim();
    }
    if (data.lastName !== undefined) {
      userUpdates.lastName = data.lastName;
      if (!data.firstName) {
        userUpdates.name = `${existingUser.firstName ?? ""} ${data.lastName}`.trim();
      }
    }
    if (data.password) {
      userUpdates.passwordHash = await hashPassword(data.password);
    }

    let updatedUser = existingUser;
    if (Object.keys(userUpdates).length > 0) {
      const result = await storage.updateUser(userId, userUpdates);
      if (result) updatedUser = result;
    }

    res.json({
      message: "Portal user updated successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "PATCH /:clientId/users/:userId", req);
  }
});

// Remove client user access
router.delete("/:clientId/users/:userId", requireTenantAdminAccess, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId, userId } = req.params;
    
    // Verify client belongs to tenant
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        throw AppError.notFound("Client");
      }
    }
    
    await storage.deleteClientUserAccess(clientId, userId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /:clientId/users/:userId", req);
  }
});

// =============================================================================
// CLIENT PORTAL REGISTRATION (public endpoints for invited clients)
// =============================================================================

// Validate invite token (public)
router.get("/register/validate", async (req, res) => {
  try {
    const { token, invite: inviteId } = req.query;
    
    if (!token || !inviteId) {
      throw AppError.badRequest("Token and invite ID are required");
    }
    
    const tokenHash = hashToken(token as string);
    const invite = await storage.getClientInvite(inviteId as string);
    
    if (!invite) {
      throw AppError.notFound("Invitation");
    }
    
    if (invite.tokenPlaceholder !== tokenHash) {
      throw AppError.forbidden("Invalid token");
    }
    
    if (invite.status !== "pending") {
      throw new AppError(410, "CONFLICT", "Invitation is no longer valid");
    }
    
    // Get contact info for registration form
    const contact = await storage.getClientContact(invite.contactId);
    const client = await storage.getClient(invite.clientId);
    
    res.json({
      valid: true,
      email: invite.email,
      firstName: contact?.firstName || "",
      lastName: contact?.lastName || "",
      clientName: client?.companyName || "",
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /register/validate", req);
  }
});

// Complete registration (public)
router.post("/register/complete", async (req, res) => {
  try {
    const { token, inviteId, password, firstName, lastName } = req.body;
    
    if (!token || !inviteId || !password) {
      throw AppError.badRequest("Token, invite ID, and password are required");
    }
    
    if (password.length < 8) {
      throw AppError.badRequest("Password must be at least 8 characters");
    }
    
    const tokenHash = hashToken(token);
    const invite = await storage.getClientInvite(inviteId);
    
    if (!invite) {
      throw AppError.notFound("Invitation");
    }
    
    if (invite.tokenPlaceholder !== tokenHash) {
      throw AppError.forbidden("Invalid token");
    }
    
    if (invite.status !== "pending") {
      throw new AppError(410, "CONFLICT", "Invitation is no longer valid");
    }
    
    // Get client for tenant context
    const client = await storage.getClient(invite.clientId);
    if (!client) {
      throw AppError.notFound("Client");
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create the client user
    const user = await storage.createUser({
      tenantId: client.tenantId,
      email: invite.email,
      name: `${firstName || ""} ${lastName || ""}`.trim() || invite.email.split("@")[0],
      firstName: firstName || null,
      lastName: lastName || null,
      passwordHash,
      role: UserRole.CLIENT,
      isActive: true,
    });
    
    // Create client user access
    const accessLevel = (invite.roleHint === "collaborator" 
      ? ClientAccessLevel.COLLABORATOR 
      : ClientAccessLevel.VIEWER) as "viewer" | "collaborator";
    
    await storage.addClientUserAccess({
      workspaceId: client.workspaceId,
      clientId: invite.clientId,
      userId: user.id,
      accessLevel,
    });
    
    // Update invite status
    await storage.updateClientInvite(invite.id, {
      status: "accepted",
    });
    
    // Update contact with linked userId (optional enhancement)
    const contact = await storage.getClientContact(invite.contactId);
    if (contact) {
      await storage.updateClientContact(contact.id, {
        notes: `Linked to user: ${user.id}`,
      });
    }
    
    res.status(201).json({
      message: "Registration complete",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    if (error?.message?.includes("unique") || error?.code === "23505") {
      throw AppError.conflict("User with this email already exists");
    }
    return handleRouteError(res, error, "POST /register/complete", req);
  }
});

export default router;
