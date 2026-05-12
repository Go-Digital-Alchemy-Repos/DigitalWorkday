import { Router } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { ClientAccessLevel, commentMentions, UserRole } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { getClientUserAccessibleClients } from "../../middleware/clientAccess";
import { handleRouteError, AppError } from "../../lib/errors";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { emailOutboxService } from "../../services/emailOutbox";

const router = Router();

// Middleware to ensure only client users can access these routes
function requireClientRole(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.CLIENT) {
    throw AppError.forbidden("This endpoint is only accessible to client portal users");
  }
  next();
}

router.use(requireClientRole);

const clientOverviewUpdateSchema = z.object({
  displayName: z.string().trim().optional().nullable(),
  legalName: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  industry: z.string().trim().optional().nullable(),
  companySize: z.string().trim().optional().nullable(),
  foundedDate: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  addressLine1: z.string().trim().optional().nullable(),
  addressLine2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  mailingAddressLine1: z.string().trim().optional().nullable(),
  mailingAddressLine2: z.string().trim().optional().nullable(),
  mailingCity: z.string().trim().optional().nullable(),
  mailingState: z.string().trim().optional().nullable(),
  mailingPostalCode: z.string().trim().optional().nullable(),
  mailingCountry: z.string().trim().optional().nullable(),
  primaryContactName: z.string().trim().optional().nullable(),
  primaryContactEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
  primaryContactPhone: z.string().trim().optional().nullable(),
});

const clientContactMutationSchema = z.object({
  firstName: z.string().trim().optional().nullable(),
  lastName: z.string().trim().optional().nullable(),
  title: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().optional().nullable(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const portalInviteSchema = z.object({
  contactId: z.string().uuid().optional(),
  email: z.string().trim().email().optional(),
  firstName: z.string().trim().optional().default(""),
  lastName: z.string().trim().optional().default(""),
  accessLevel: z.enum([
    ClientAccessLevel.VIEWER,
    ClientAccessLevel.COLLABORATOR,
    ClientAccessLevel.PORTAL_ADMIN,
  ]).default(ClientAccessLevel.VIEWER),
}).refine(data => Boolean(data.contactId || data.email), {
  message: "Contact ID or email is required",
});

const portalUserUpdateSchema = z.object({
  accessLevel: z.enum([
    ClientAccessLevel.VIEWER,
    ClientAccessLevel.COLLABORATOR,
    ClientAccessLevel.PORTAL_ADMIN,
  ]).optional(),
  isActive: z.boolean().optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().optional(),
});

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

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

async function getClientAccessOrThrow(userId: string, clientId: string) {
  const access = await storage.getClientUserAccessByUserAndClient(userId, clientId);
  if (!access) {
    throw AppError.forbidden("Access denied");
  }
  return access;
}

function canEditClientData(accessLevel: string) {
  return [
    ClientAccessLevel.VIEWER,
    ClientAccessLevel.COLLABORATOR,
    ClientAccessLevel.PORTAL_ADMIN,
  ].includes(accessLevel as any);
}

function canManagePortalUsers(accessLevel: string) {
  return [
    ClientAccessLevel.VIEWER,
    ClientAccessLevel.COLLABORATOR,
    ClientAccessLevel.PORTAL_ADMIN,
  ].includes(accessLevel as any);
}

function assertCanEditClientData(accessLevel: string) {
  if (!canEditClientData(accessLevel)) {
    throw AppError.forbidden("Client portal access required");
  }
}

function assertCanManagePortalUsers(accessLevel: string) {
  if (!canManagePortalUsers(accessLevel)) {
    throw AppError.forbidden("Client portal access required");
  }
}

function sanitizeClientOverview(client: any) {
  return {
    id: client.id,
    companyName: client.companyName,
    displayName: client.displayName,
    legalName: client.legalName,
    website: client.website,
    industry: client.industry,
    companySize: client.companySize,
    foundedDate: client.foundedDate,
    description: client.description,
    phone: client.phone,
    email: client.email,
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    city: client.city,
    state: client.state,
    postalCode: client.postalCode,
    country: client.country,
    mailingAddressLine1: client.mailingAddressLine1,
    mailingAddressLine2: client.mailingAddressLine2,
    mailingCity: client.mailingCity,
    mailingState: client.mailingState,
    mailingPostalCode: client.mailingPostalCode,
    mailingCountry: client.mailingCountry,
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail,
    primaryContactPhone: client.primaryContactPhone,
    status: client.status,
  };
}

function getAssignmentSummary(task: any) {
  const assigneeCount = Array.isArray(task.assignees) ? task.assignees.length : 0;
  return {
    assignmentStatus: assigneeCount > 0 ? "Assigned" : "Unassigned",
    assigneeCount,
  };
}

function sanitizeTaskForPortal(task: any, project?: any) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    estimateMinutes: task.estimateMinutes,
    projectId: task.projectId ?? project?.id,
    projectName: project?.name,
    sectionId: task.sectionId,
    section: task.section,
    subtasks: task.subtasks,
    tags: task.tags,
    ...getAssignmentSummary(task),
  };
}

async function getMentionedCommentIdsForUser(userId: string, commentIds: string[]) {
  if (commentIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({ commentId: commentMentions.commentId })
    .from(commentMentions)
    .where(and(
      eq(commentMentions.mentionedUserId, userId),
      inArray(commentMentions.commentId, commentIds),
    ));

  return new Set(rows.map(row => row.commentId));
}

// =============================================================================
// CLIENT-SAFE ACCOUNT DATA
// =============================================================================

router.get("/clients/:clientId/overview", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId } = req.params;
    await getClientAccessOrThrow(userId, clientId);

    const client = await storage.getClient(clientId);
    if (!client) {
      throw AppError.notFound("Client");
    }

    res.json(sanitizeClientOverview(client));
  } catch (error) {
    return handleRouteError(res, error, "GET /clients/:clientId/overview", req);
  }
});

router.patch("/clients/:clientId/overview", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId } = req.params;
    const access = await getClientAccessOrThrow(userId, clientId);
    assertCanEditClientData(access.accessLevel);

    const data = clientOverviewUpdateSchema.parse(req.body);
    const client = await storage.updateClient(clientId, data);
    if (!client) {
      throw AppError.notFound("Client");
    }

    res.json(sanitizeClientOverview(client));
  } catch (error) {
    return handleRouteError(res, error, "PATCH /clients/:clientId/overview", req);
  }
});

router.get("/clients/:clientId/contacts", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId } = req.params;
    await getClientAccessOrThrow(userId, clientId);

    const contacts = await storage.getContactsByClient(clientId);
    res.json(contacts);
  } catch (error) {
    return handleRouteError(res, error, "GET /clients/:clientId/contacts", req);
  }
});

router.post("/clients/:clientId/contacts", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId } = req.params;
    const access = await getClientAccessOrThrow(userId, clientId);
    assertCanEditClientData(access.accessLevel);

    const client = await storage.getClient(clientId);
    if (!client) {
      throw AppError.notFound("Client");
    }

    const data = clientContactMutationSchema.parse(req.body);
    const contact = await storage.createClientContact({
      ...data,
      email: data.email || null,
      clientId,
      tenantId: client.tenantId,
      workspaceId: client.workspaceId,
    });

    res.status(201).json(contact);
  } catch (error) {
    return handleRouteError(res, error, "POST /clients/:clientId/contacts", req);
  }
});

router.patch("/clients/:clientId/contacts/:contactId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId, contactId } = req.params;
    const access = await getClientAccessOrThrow(userId, clientId);
    assertCanEditClientData(access.accessLevel);

    const existingContacts = await storage.getContactsByClient(clientId);
    if (!existingContacts.some(contact => contact.id === contactId)) {
      throw AppError.notFound("Contact");
    }

    const data = clientContactMutationSchema.partial().parse(req.body);
    const normalizedData = {
      ...data,
      ...(Object.prototype.hasOwnProperty.call(data, "email") ? { email: data.email || null } : {}),
    };
    const contact = await storage.updateClientContact(contactId, normalizedData);
    if (!contact) {
      throw AppError.notFound("Contact");
    }

    res.json(contact);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /clients/:clientId/contacts/:contactId", req);
  }
});

router.delete("/clients/:clientId/contacts/:contactId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId, contactId } = req.params;
    const access = await getClientAccessOrThrow(userId, clientId);
    assertCanEditClientData(access.accessLevel);

    const existingContacts = await storage.getContactsByClient(clientId);
    if (!existingContacts.some(contact => contact.id === contactId)) {
      throw AppError.notFound("Contact");
    }

    await storage.deleteClientContact(contactId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /clients/:clientId/contacts/:contactId", req);
  }
});

router.get("/clients/:clientId/users", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId } = req.params;
    const access = await getClientAccessOrThrow(userId, clientId);
    assertCanManagePortalUsers(access.accessLevel);

    const users = await storage.getClientUsers(clientId);
    res.json(users);
  } catch (error) {
    return handleRouteError(res, error, "GET /clients/:clientId/users", req);
  }
});

router.post("/clients/:clientId/users/invite", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clientId } = req.params;
    const access = await getClientAccessOrThrow(userId, clientId);
    assertCanManagePortalUsers(access.accessLevel);

    const client = await storage.getClient(clientId);
    if (!client) {
      throw AppError.notFound("Client");
    }

    const data = portalInviteSchema.parse(req.body);
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

    const existingUser = await storage.getUserByEmail(inviteEmail);
    if (existingUser) {
      if (existingUser.role !== UserRole.CLIENT) {
        throw AppError.conflict("This email belongs to an internal user. Invite a different client portal email.");
      }

      const existingAccess = await storage.getClientUserAccessByUserAndClient(existingUser.id, clientId);
      if (existingAccess) {
        throw AppError.conflict("User already has access to this client");
      }

      const grantedAccess = await storage.addClientUserAccess({
        workspaceId: client.workspaceId,
        clientId,
        userId: existingUser.id,
        accessLevel: data.accessLevel,
      });

      return res.status(201).json({
        message: "Access granted to existing user",
        access: grantedAccess,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
        },
      });
    }

    const token = generateInviteToken();
    const invite = await storage.createClientInvite({
      clientId,
      contactId: contact.id,
      email: inviteEmail,
      status: "pending",
      tokenPlaceholder: hashToken(token),
    });

    await storage.updateClientInvite(invite.id, {
      roleHint: data.accessLevel,
    });

    const registrationUrl = `${getPublicAppUrl(req)}/client-portal/register?token=${token}&invite=${invite.id}`;
    const recipientName = `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
    const emailResult = await sendPortalInviteEmail({
      tenantId: client.tenantId || null,
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
      email: {
        success: emailResult.success,
        emailId: emailResult.emailId,
        error: emailResult.error,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /clients/:clientId/users/invite", req);
  }
});

router.patch("/clients/:clientId/users/:userId", async (req, res) => {
  try {
    const currentUserId = req.user!.id;
    const { clientId, userId } = req.params;
    const access = await getClientAccessOrThrow(currentUserId, clientId);
    assertCanManagePortalUsers(access.accessLevel);

    const data = portalUserUpdateSchema.parse(req.body);
    const existingAccess = await storage.getClientUserAccessByUserAndClient(userId, clientId);
    if (!existingAccess) {
      throw AppError.notFound("Portal user access");
    }

    let updatedAccess = existingAccess;
    if (data.accessLevel !== undefined || data.isActive !== undefined) {
      const accessUpdates: Record<string, unknown> = {};
      if (data.accessLevel !== undefined) accessUpdates.accessLevel = data.accessLevel;
      if (data.isActive !== undefined) accessUpdates.isActive = data.isActive;
      const result = await storage.updateClientUserAccess(clientId, userId, accessUpdates);
      if (result) updatedAccess = result;
    }

    const targetUser = await storage.getUser(userId);
    if (!targetUser || targetUser.role !== UserRole.CLIENT) {
      throw AppError.notFound("Portal user");
    }

    const userUpdates: Record<string, unknown> = {};
    if (data.firstName !== undefined) {
      userUpdates.firstName = data.firstName;
      userUpdates.name = `${data.firstName} ${data.lastName ?? targetUser.lastName ?? ""}`.trim();
    }
    if (data.lastName !== undefined) {
      userUpdates.lastName = data.lastName;
      if (data.firstName === undefined) {
        userUpdates.name = `${targetUser.firstName ?? ""} ${data.lastName}`.trim();
      }
    }

    const updatedUser = Object.keys(userUpdates).length > 0
      ? await storage.updateUser(userId, userUpdates)
      : targetUser;

    res.json({
      ...updatedAccess,
      user: updatedUser ? {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
      } : undefined,
    });
  } catch (error) {
    return handleRouteError(res, error, "PATCH /clients/:clientId/users/:userId", req);
  }
});

router.delete("/clients/:clientId/users/:userId", async (req, res) => {
  try {
    const currentUserId = req.user!.id;
    const { clientId, userId } = req.params;
    const access = await getClientAccessOrThrow(currentUserId, clientId);
    assertCanManagePortalUsers(access.accessLevel);

    if (userId === currentUserId) {
      throw AppError.badRequest("Portal users cannot remove their own access");
    }

    await storage.deleteClientUserAccess(clientId, userId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /clients/:clientId/users/:userId", req);
  }
});

// =============================================================================
// CLIENT PORTAL DASHBOARD DATA
// =============================================================================

// Get dashboard summary for client user
router.get("/dashboard", async (req, res) => {
  try {
    const userId = req.user!.id;
    const clientIds = await getClientUserAccessibleClients(userId);
    
    if (clientIds.length === 0) {
      return res.json({
        clients: [],
        projects: [],
        tasks: [],
        upcomingDeadlines: [],
        recentActivity: [],
      });
    }
    
    // Get all accessible clients
    const clientsData = await storage.getClientsForUser(userId);
    const clients = clientsData.map(cd => ({
      id: cd.client.id,
      companyName: cd.client.companyName,
      displayName: cd.client.displayName,
      accessLevel: cd.access.accessLevel,
    }));
    
    const allProjects: any[] = [];
    const allTasks: any[] = [];
    
    for (const clientId of clientIds) {
      const projects = await storage.getProjectsByClient(clientId);
      
      for (const project of projects) {
        if ((project as any).visibility === 'private') continue;
        allProjects.push({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          clientId: project.clientId,
          createdAt: project.createdAt,
        });
        
        const tasksList = await storage.getTasksByProject(project.id);
        for (const task of tasksList) {
          if ((task as any).visibility === 'private') continue;
          allTasks.push({
            ...sanitizeTaskForPortal(task, project),
          });
        }
      }
    }
    
    // Get upcoming deadlines (tasks due in next 14 days)
    const now = new Date();
    const twoWeeksLater = new Date(now);
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
    
    const upcomingDeadlines = allTasks
      .filter(t => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= twoWeeksLater)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 10);
    
    // Calculate summary stats
    const stats = {
      totalProjects: allProjects.length,
      activeProjects: allProjects.filter(p => p.status === "active" || p.status === "in_progress").length,
      totalTasks: allTasks.length,
      completedTasks: allTasks.filter(t => t.status === "completed").length,
      pendingTasks: allTasks.filter(t => t.status !== "completed").length,
      overdueTasks: allTasks.filter(t => 
        t.dueDate && 
        new Date(t.dueDate) < now && 
        t.status !== "completed"
      ).length,
    };
    
    res.json({
      clients,
      projects: allProjects,
      tasks: allTasks,
      stats,
      upcomingDeadlines,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /dashboard", req);
  }
});

// Get projects for client user
router.get("/projects", async (req, res) => {
  try {
    const userId = req.user!.id;
    const clientIds = await getClientUserAccessibleClients(userId);
    
    const allProjects: any[] = [];
    
    for (const clientId of clientIds) {
      const client = await storage.getClient(clientId);
      const projects = await storage.getProjectsByClient(clientId);
      
      for (const project of projects) {
        if ((project as any).visibility === 'private') continue;
        const tasks = await storage.getTasksByProject(project.id);
        const visibleTasks = tasks.filter(t => (t as any).visibility !== 'private');
        const taskCount = visibleTasks.length;
        const completedCount = visibleTasks.filter(t => t.status === "completed").length;
        
        allProjects.push({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          clientId: project.clientId,
          clientName: client?.companyName,
          createdAt: project.createdAt,
          taskCount,
          completedCount,
          progress: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
        });
      }
    }
    
    res.json(allProjects);
  } catch (error) {
    return handleRouteError(res, error, "GET /projects", req);
  }
});

// Get specific project details
router.get("/projects/:projectId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.params;
    
    const project = await storage.getProject(projectId);
    if (!project || !project.clientId) {
      throw AppError.notFound("Project");
    }
    
    if ((project as any).visibility === 'private') {
      throw AppError.notFound("Project");
    }
    
    const access = await storage.getClientUserAccessByUserAndClient(userId, project.clientId);
    if (!access) {
      throw AppError.forbidden("Access denied");
    }
    
    const client = await storage.getClient(project.clientId);
    const allTasks = await storage.getTasksByProject(projectId);
    const tasks = allTasks.filter(t => (t as any).visibility !== 'private');
    
    const tasksForClient = tasks.map(task => sanitizeTaskForPortal(task, project));
    
    res.json({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
      clientId: project.clientId,
      clientName: client?.companyName,
      tasks: tasksForClient,
      taskCount: tasks.length,
      completedCount: tasks.filter(t => t.status === "completed").length,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /projects/:projectId", req);
  }
});

// Get tasks for client user across all accessible projects
router.get("/tasks", async (req, res) => {
  try {
    const userId = req.user!.id;
    const clientIds = await getClientUserAccessibleClients(userId);
    const { status, projectId } = req.query;
    
    const allTasks: any[] = [];
    
    for (const clientId of clientIds) {
      const projects = await storage.getProjectsByClient(clientId);
      
      for (const project of projects) {
        if ((project as any).visibility === 'private') continue;
        if (projectId && project.id !== projectId) continue;
        
        const tasks = await storage.getTasksByProject(project.id);
        
        for (const task of tasks) {
          if ((task as any).visibility === 'private') continue;
          if (status && task.status !== status) continue;
          
          allTasks.push({
            ...sanitizeTaskForPortal(task, project),
          });
        }
      }
    }
    
    // Sort by due date (null dates at the end)
    allTasks.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    res.json(allTasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /tasks", req);
  }
});

// Get specific task details
router.get("/tasks/:taskId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { taskId } = req.params;
    
    const task = await storage.getTaskWithRelations(taskId);
    if (!task || !task.projectId) {
      throw AppError.notFound("Task");
    }
    if ((task as any).visibility === 'private') {
      throw AppError.notFound("Task");
    }
    
    const project = await storage.getProject(task.projectId);
    if (!project || !project.clientId) {
      throw AppError.notFound("Task");
    }
    if ((project as any).visibility === 'private') {
      throw AppError.notFound("Task");
    }
    
    const access = await storage.getClientUserAccessByUserAndClient(userId, project.clientId);
    if (!access) {
      throw AppError.forbidden("Access denied");
    }
    
    // Get comments for this task
    const comments = await storage.getCommentsByTask(taskId);
    const mentionedCommentIds = await getMentionedCommentIdsForUser(
      userId,
      comments.map(comment => comment.id),
    );
    const visibleComments = comments.filter(comment => mentionedCommentIds.has(comment.id));
    
    res.json({
      ...sanitizeTaskForPortal(task, project),
      comments: visibleComments.map(c => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        user: c.user ? {
          id: c.user.id,
          name: c.user.name,
          avatarUrl: c.user.avatarUrl,
        } : null,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /tasks/:taskId", req);
  }
});

// Portal project views are read-only. Internal team comments remain hidden unless
// the portal user was explicitly mentioned in an existing comment.
router.post("/tasks/:taskId/comments", async (req, res) => {
  try {
    throw AppError.forbidden("Portal users cannot add internal task comments from project views");
  } catch (error) {
    return handleRouteError(res, error, "POST /tasks/:taskId/comments", req);
  }
});

// Get client user profile info
router.get("/profile", async (req, res) => {
  try {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    
    if (!user) {
      throw AppError.notFound("User");
    }
    
    const clientsAccess = await storage.getClientsForUser(userId);
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      clients: clientsAccess.map(ca => ({
        id: ca.client.id,
        companyName: ca.client.companyName,
        displayName: ca.client.displayName,
        accessLevel: ca.access.accessLevel,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /profile", req);
  }
});

export default router;
