import { Router } from "express";
import { z } from "zod";
import { createHash } from "crypto";
import { storage } from "../../storage";
import { hashPassword } from "../../auth";
import { AppError, handleRouteError } from "../../lib/errors";
import { ClientAccessLevel, UserRole } from "@shared/schema";

const router = Router();

const clientAccessLevelSchema = z.enum([
  ClientAccessLevel.VIEWER,
  ClientAccessLevel.COLLABORATOR,
  ClientAccessLevel.PORTAL_ADMIN,
]);

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getInviteAccessLevel(roleHint: string | null | undefined) {
  const parsed = clientAccessLevelSchema.safeParse(roleHint);
  return parsed.success ? parsed.data : ClientAccessLevel.VIEWER;
}

router.get("/invites/validate", async (req, res) => {
  try {
    const querySchema = z.object({
      token: z.string().min(1),
      invite: z.string().uuid(),
    });
    const { token, invite: inviteId } = querySchema.parse(req.query);

    const invite = await storage.getClientInvite(inviteId);
    if (!invite) throw AppError.notFound("Invitation");
    if (invite.tokenPlaceholder !== hashToken(token)) {
      throw AppError.forbidden("Invalid invitation token");
    }
    if (invite.status !== "pending") {
      throw new AppError(410, "CONFLICT", "Invitation is no longer valid");
    }

    const [contact, client] = await Promise.all([
      storage.getClientContact(invite.contactId),
      storage.getClient(invite.clientId),
    ]);

    res.json({
      valid: true,
      inviteId: invite.id,
      email: invite.email,
      firstName: contact?.firstName || "",
      lastName: contact?.lastName || "",
      accessLevel: getInviteAccessLevel(invite.roleHint),
      clientName: client?.displayName || client?.companyName || "",
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/public/client-portal/invites/validate", req);
  }
});

router.post("/invites/accept", async (req, res) => {
  try {
    const bodySchema = z.object({
      token: z.string().min(1),
      inviteId: z.string().uuid(),
      password: z.string().min(8, "Password must be at least 8 characters"),
      firstName: z.string().trim().optional().default(""),
      lastName: z.string().trim().optional().default(""),
    });
    const data = bodySchema.parse(req.body);

    const invite = await storage.getClientInvite(data.inviteId);
    if (!invite) throw AppError.notFound("Invitation");
    if (invite.tokenPlaceholder !== hashToken(data.token)) {
      throw AppError.forbidden("Invalid invitation token");
    }
    if (invite.status !== "pending") {
      throw new AppError(410, "CONFLICT", "Invitation is no longer valid");
    }

    const client = await storage.getClient(invite.clientId);
    if (!client) throw AppError.notFound("Client");

    const existingUser = await storage.getUserByEmail(invite.email);
    if (existingUser) {
      if (existingUser.role !== UserRole.CLIENT) {
        throw AppError.conflict("This invitation email belongs to an internal user");
      }

      const existingAccess = await storage.getClientUserAccessByUserAndClient(existingUser.id, invite.clientId);
      if (!existingAccess) {
        await storage.addClientUserAccess({
          workspaceId: client.workspaceId,
          clientId: invite.clientId,
          userId: existingUser.id,
          accessLevel: getInviteAccessLevel(invite.roleHint),
        });
      }

      await storage.updateClientInvite(invite.id, { status: "accepted" });
      return res.json({
        message: "Invitation accepted. Please log in with your existing account.",
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
        },
        requiresLogin: true,
      });
    }

    const firstName = data.firstName || "";
    const lastName = data.lastName || "";
    const passwordHash = await hashPassword(data.password);
    const user = await storage.createUser({
      tenantId: client.tenantId,
      email: invite.email,
      name: `${firstName} ${lastName}`.trim() || invite.email.split("@")[0],
      firstName: firstName || null,
      lastName: lastName || null,
      passwordHash,
      role: UserRole.CLIENT,
      isActive: true,
    });

    await storage.addClientUserAccess({
      workspaceId: client.workspaceId,
      clientId: invite.clientId,
      userId: user.id,
      accessLevel: getInviteAccessLevel(invite.roleHint),
    });

    await storage.updateClientInvite(invite.id, { status: "accepted" });

    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
    req.logIn(userWithoutPassword as Express.User, (loginErr) => {
      if (loginErr) {
        console.error("[client-portal] invite accept login error:", loginErr);
        return res.status(201).json({
          message: "Portal account created. Please log in.",
          user: userWithoutPassword,
          autoLoginFailed: true,
        });
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[client-portal] session save error:", saveErr);
        }
        return res.status(201).json({
          message: "Portal account created",
          user: userWithoutPassword,
          autoLoginFailed: false,
        });
      });
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      return handleRouteError(res, AppError.conflict("A user with this email already exists"), "POST /api/v1/public/client-portal/invites/accept", req);
    }
    return handleRouteError(res, error, "POST /api/v1/public/client-portal/invites/accept", req);
  }
});

export default router;
