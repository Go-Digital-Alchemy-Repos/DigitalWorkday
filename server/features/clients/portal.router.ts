import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { db } from "../../db";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { UserRole, ClientAccessLevel, users } from "@shared/schema";
import { hasTenantAdminAccess } from "@shared/roles";
import type { Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "crypto";
import { hashPassword } from "../../auth";
import { handleRouteError, AppError } from "../../lib/errors";
import { emailOutboxService } from "../../services/emailOutbox";
import { eq } from "drizzle-orm";

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

const clientAccessLevelSchema = z.enum([
  ClientAccessLevel.VIEWER,
  ClientAccessLevel.COLLABORATOR,
  ClientAccessLevel.PORTAL_ADMIN,
]);

// Generate secure invite token
function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

// Hash token for storage (for security, don't store raw token)
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getPublicAppUrl(req: Request): string {
  return (process.env.APP_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function ensureCanManagePortalUsers(req: Request, clientId: string) {
  if (isTenantAdmin(req)) return;
  if (!isClientUser(req) || !req.user?.id) {
    throw AppError.forbidden("Only admins, project managers, or portal admins can manage portal users");
  }

  const access = await storage.getClientUserAccessByUserAndClient(req.user.id, clientId);
  if (!access || access.accessLevel !== ClientAccessLevel.PORTAL_ADMIN) {
    throw AppError.forbidden("Portal admin access is required");
  }
}

async function sendPortalInviteEmail(options: {
  tenantId: string | null;
  toEmail: string;
  recipientName: string;
  clientName: string;
  registrationUrl: string;
  requestId?: string;
  inviteId: string;
  clientId: string;
}) {
  const recipient = options.recipientName || options.toEmail;
  const subject = `You're invited to the ${options.clientName} client portal`;
  const textBody = [
    `Hi ${recipient},`,
    "",
    `You've been invited to access the Digital Workday client portal for ${options.clientName}.`,
    "Use the link below to set your password and finish setting up your account:",
    "",
    options.registrationUrl,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
      <h2 style="margin:0 0 16px">You're invited to Digital Workday</h2>
      <p>Hi ${escapeHtml(recipient)},</p>
      <p>You've been invited to access the Digital Workday client portal for <strong>${escapeHtml(options.clientName)}</strong>.</p>
      <p>
        <a href="${escapeHtml(options.registrationUrl)}" style="display:inline-block;background:#4f9f2f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">
          Set up your portal account
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(options.registrationUrl)}</p>
    </div>
  `;

  return emailOutboxService.sendEmail({
    tenantId: options.tenantId,
    messageType: "invitation",
    toEmail: options.toEmail,
    subject,
    textBody,
    htmlBody,
    requestId: options.requestId,
    metadata: {
      inviteType: "client_portal",
      inviteId: options.inviteId,
      clientId: options.clientId,
    },
  });
}

// =============================================================================
// CLIENT USER MANAGEMENT ROUTES (for tenant admins/employees)
// =============================================================================

// Get all client users for a specific client
router.get("/:clientId/users", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    await ensureCanManagePortalUsers(req, clientId);
    
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
router.post("/:clientId/users/invite", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    await ensureCanManagePortalUsers(req, clientId);

    const schema = z.object({
      contactId: z.string().uuid().optional(),
      email: z.string().email().optional(),
      firstName: z.string().trim().optional().default(""),
      lastName: z.string().trim().optional().default(""),
      accessLevel: clientAccessLevelSchema.default(ClientAccessLevel.COLLABORATOR),
    }).refine((data) => Boolean(data.contactId || data.email), {
      message: "Contact ID or email is required",
    });
    const data = schema.parse(req.body);
    const accessLevel = data.accessLevel;
    
    // Verify client belongs to tenant
    const client = tenantId 
      ? await storage.getClientByIdAndTenant(clientId, tenantId)
      : await storage.getClient(clientId);
    
    if (!client) {
      throw AppError.notFound("Client");
    }
    
    let contact = data.contactId ? await storage.getClientContact(data.contactId) : undefined;
    if (data.contactId && (!contact || contact.clientId !== clientId)) {
      throw AppError.notFound("Contact");
    }

    const inviteEmail = (contact?.email || data.email || "").trim().toLowerCase();
    if (!inviteEmail) {
      throw AppError.badRequest("An email address is required");
    }

    if (!contact) {
      contact = await storage.createClientContact({
        tenantId: client.tenantId,
        workspaceId: client.workspaceId,
        clientId,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email: inviteEmail,
        isPrimary: false,
      });
    }
    
    // Check if user already exists with this email
    let existingUser = await storage.getUserByEmail(inviteEmail);
    
    if (existingUser) {
      if (existingUser.role !== UserRole.CLIENT) {
        throw AppError.conflict("This email belongs to an internal user. Invite a different client portal email.");
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
    
    // Update or create client invite with real token
    const invite = await storage.createClientInvite({
      clientId,
      contactId: contact.id,
      email: inviteEmail,
      status: "pending",
      tokenPlaceholder: tokenHash,
    });
    
    // Store additional invite metadata for user creation
    await storage.updateClientInvite(invite.id, {
      roleHint: accessLevel,
    });
    
    const publicUrl = getPublicAppUrl(req);
    const registrationUrl = `${publicUrl}/client-portal/register?token=${token}&invite=${invite.id}`;
    const recipientName = `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
    const emailResult = await sendPortalInviteEmail({
      tenantId: client.tenantId || tenantId || null,
      toEmail: inviteEmail,
      recipientName,
      clientName: client.displayName || client.companyName,
      registrationUrl,
      requestId: req.requestId,
      inviteId: invite.id,
      clientId,
    });

    res.status(201).json({
      message: emailResult.success ? "Invitation sent" : "Invitation created, but email delivery failed",
      invite: {
        id: invite.id,
        email: invite.email,
        status: invite.status,
        createdAt: invite.createdAt,
      },
      registrationUrl,
      email: {
        success: emailResult.success,
        emailId: emailResult.emailId,
        error: emailResult.error,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /:clientId/users/invite", req);
  }
});

router.post("/:clientId/users/create", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    await ensureCanManagePortalUsers(req, clientId);

    const schema = z.object({
      contactId: z.string().uuid().optional(),
      email: z.string().email().optional(),
      firstName: z.string().trim().optional().default(""),
      lastName: z.string().trim().optional().default(""),
      accessLevel: clientAccessLevelSchema.default(ClientAccessLevel.COLLABORATOR),
      password: z.string().min(8, "Password must be at least 8 characters"),
    }).refine((data) => Boolean(data.contactId || data.email), {
      message: "Contact ID or email is required",
    });
    const data = schema.parse(req.body);

    const client = tenantId
      ? await storage.getClientByIdAndTenant(clientId, tenantId)
      : await storage.getClient(clientId);
    if (!client) {
      throw AppError.notFound("Client");
    }

    let contact = data.contactId ? await storage.getClientContact(data.contactId) : undefined;
    if (data.contactId && (!contact || contact.clientId !== clientId)) {
      throw AppError.notFound("Contact");
    }

    const email = (contact?.email || data.email || "").trim().toLowerCase();
    if (!email) {
      throw AppError.badRequest("An email address is required");
    }

    if (!contact) {
      contact = await storage.createClientContact({
        tenantId: client.tenantId,
        workspaceId: client.workspaceId,
        clientId,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email,
        isPrimary: false,
      });
    }

    const firstName = data.firstName || contact.firstName || "";
    const lastName = data.lastName || contact.lastName || "";
    const name = `${firstName} ${lastName}`.trim() || email;
    const passwordHash = await hashPassword(data.password);

    let user = await storage.getUserByEmail(email);
    if (user) {
      if (user.role !== UserRole.CLIENT) {
        throw AppError.conflict("This email belongs to an internal user. Use a different client portal email.");
      }

      const [updated] = await db.update(users)
        .set({
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          name,
          passwordHash,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      user = updated || user;
    } else {
      user = await storage.createUser({
        tenantId: client.tenantId,
        email,
        name,
        firstName: firstName || null,
        lastName: lastName || null,
        passwordHash,
        role: UserRole.CLIENT,
        isActive: true,
      } as any);
    }

    let access = await storage.getClientUserAccessByUserAndClient(user.id, clientId);
    if (access) {
      access = await storage.updateClientUserAccess(clientId, user.id, { accessLevel: data.accessLevel }) || access;
    } else {
      access = await storage.addClientUserAccess({
        workspaceId: client.workspaceId,
        clientId,
        userId: user.id,
        accessLevel: data.accessLevel,
      });
    }

    res.status(201).json({
      message: "Portal user provisioned",
      access,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /:clientId/users/create", req);
  }
});

// Update client user (access level, name, and optionally password)
router.patch("/:clientId/users/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId, userId } = req.params;

    const schema = z.object({
      accessLevel: clientAccessLevelSchema.optional(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().optional(),
      password: z.string().min(8, "Password must be at least 8 characters").optional(),
    }).refine(data => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    });

    const data = schema.parse(req.body);
    await ensureCanManagePortalUsers(req, clientId);

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
      const [result] = await db.update(users)
        .set({ ...userUpdates, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
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
router.delete("/:clientId/users/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId, userId } = req.params;
    await ensureCanManagePortalUsers(req, clientId);
    
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
    const parsedAccessLevel = clientAccessLevelSchema.safeParse(invite.roleHint);
    const accessLevel = parsedAccessLevel.success ? parsedAccessLevel.data : ClientAccessLevel.COLLABORATOR;
    
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
