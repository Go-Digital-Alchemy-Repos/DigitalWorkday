import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { UserRole, ClientAccessLevel } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "crypto";
import { hashPassword } from "../../auth";
import { handleRouteError, AppError } from "../../lib/errors";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

function isClientUser(req: Request): boolean {
  return req.user?.role === UserRole.CLIENT;
}

function isTenantAdmin(req: Request): boolean {
  return req.user?.role === UserRole.ADMIN;
}

const router = Router();

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
router.get("/:clientId/users", async (req, res) => {
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
router.post("/:clientId/users/invite", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    const { contactId, accessLevel = ClientAccessLevel.VIEWER } = req.body;
    
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
      contactId,
      email: contact.email,
      status: "pending",
      tokenPlaceholder: tokenHash,
    });
    
    // Store additional invite metadata for user creation
    await storage.updateClientInvite(invite.id, {
      roleHint: accessLevel,
    });
    
    // Return the invite with token (only time raw token is exposed)
    res.status(201).json({
      message: "Invitation created",
      invite: {
        id: invite.id,
        email: invite.email,
        status: invite.status,
        createdAt: invite.createdAt,
      },
      registrationUrl: `/client-portal/register?token=${token}&invite=${invite.id}`,
      token, // Include token for sending via email
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /:clientId/users/invite", req);
  }
});

// Create a client portal user directly (with password, no invite flow)
router.post("/:clientId/users/create", async (req, res) => {
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
router.patch("/:clientId/users/:userId", async (req, res) => {
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
router.delete("/:clientId/users/:userId", async (req, res) => {
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
