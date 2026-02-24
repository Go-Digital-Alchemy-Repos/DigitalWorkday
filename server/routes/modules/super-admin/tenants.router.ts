import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { z } from 'zod';
import { eq, sql, ilike } from 'drizzle-orm';
import {
  insertTenantSchema,
  TenantStatus,
  tenants,
  workspaces,
  invitations,
  tenantSettings,
  tenantNotes,
  tenantNoteVersions,
  tenantAuditEvents,
  clients,
  clientContacts,
  clientDivisions,
  projects,
  tasks,
  users,
  teams,
  tenantAgreements,
  tenantAgreementAcceptances,
  timeEntries,
  platformAuditEvents,
  workspaceMembers,
  teamMembers,
  projectMembers,
  divisionMembers,
  activityLog,
  comments,
  chatReads,
  chatMessages,
  chatChannelMembers,
  chatChannels,
  notifications,
  notificationPreferences,
  activeTimers,
  clientUserAccess,
  clientInvites,
  tenantIntegrations,
  appSettings,
  errorLogs,
  emailOutbox,
  sections,
  taskAssignees,
  taskWatchers,
  personalTaskSections,
  subtasks,
  subtaskAssignees,
  subtaskTags,
  tags,
  taskTags,
  taskAttachments,
  commentMentions,
  chatDmThreads,
  chatDmMembers,
  chatAttachments,
  chatMentions,
  chatPins,
  chatExportJobs,
  chatMessageReactions,
  tenancyWarnings,
  controlCenterWidgetLayouts,
  clientStageHistory,
  clientStageAutomationRules,
  clientStageAutomationEvents,
  assetFolders,
  assets,
  assetLinks,
  tenantDefaultFolders,
  tenantDefaultDocuments,
  clientCrm,
  clientFiles,
  userClientAccess,
  clientNoteCategories,
  clientNotes,
  clientNoteVersions,
  clientNoteAttachments,
  projectNoteCategories,
  projectNotes,
  projectNoteVersions,
  clientDocumentCategories,
  clientDocumentFolders,
  clientDocuments,
  hiddenProjects,
  projectTemplates,
  userUiPreferences,
  approvalRequests,
  clientConversations,
  clientMessages,
  clientConversationReads,
  clientMessageTemplates,
  integrationEntityMap,
  backgroundJobs,
  asanaImportRuns,
  supportTickets,
  supportTicketMessages,
  supportTicketEvents,
  supportCannedReplies,
  supportMacros,
  supportSlaPolicies,
  supportTicketFormSchemas,
  conversationSlaPolicies,
} from '@shared/schema';
import { recordTenantAuditEvent } from '../../superAdmin';
import { tenantIntegrationService } from '../../../services/tenantIntegrations';

export const tenantsRouter = Router();

tenantsRouter.get("/tenants", requireSuperUser, async (req, res) => {
  try {
    const tenants = await storage.getAllTenants();
    res.json(tenants);
  } catch (error) {
    console.error("Error fetching tenants:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

tenantsRouter.get("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    console.error("Error fetching tenant:", error);
    res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

const createTenantSchema = insertTenantSchema.extend({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

tenantsRouter.post("/tenants", requireSuperUser, async (req, res) => {
  const requestId = req.requestId || "unknown";
  const superUser = req.user!;
  const debugEnabled = process.env.SUPER_TENANT_CREATE_DEBUG === "true";
  
  try {
    const data = createTenantSchema.parse(req.body);
    
    if (debugEnabled) {
      console.log(`[TenantCreate] requestId=${requestId} actor=${superUser?.id} input=${JSON.stringify({ name: data.name, slug: data.slug })}`);
    }
    
    const existingTenant = await storage.getTenantBySlug(data.slug);
    if (existingTenant) {
      console.log(`[TenantCreate] requestId=${requestId} slug collision: ${data.slug}`);
      return res.status(409).json({ error: "A tenant with this slug already exists" });
    }
    
    const result = await db.transaction(async (tx) => {
      if (debugEnabled) {
        console.log(`[TenantCreate] requestId=${requestId} step=tenant_insert`);
      }
      const [tenant] = await tx.insert(tenants).values({
        ...data,
        status: TenantStatus.INACTIVE,
      }).returning();

      if (debugEnabled) {
        console.log(`[TenantCreate] requestId=${requestId} step=workspace_insert tenantId=${tenant.id}`);
      }
      const [primaryWorkspace] = await tx.insert(workspaces).values({
        name: data.name.trim(),
        tenantId: tenant.id,
        isPrimary: true,
      }).returning();

      if (debugEnabled) {
        console.log(`[TenantCreate] requestId=${requestId} step=settings_insert tenantId=${tenant.id}`);
      }
      await tx.insert(tenantSettings).values({
        tenantId: tenant.id,
        displayName: tenant.name,
      });

      return { tenant, primaryWorkspace };
    });

    console.log(`[SuperAdmin] Created tenant ${result.tenant.id} with primary workspace ${result.primaryWorkspace.id}`);

    await recordTenantAuditEvent(
      result.tenant.id,
      "tenant_created",
      `Tenant "${result.tenant.name}" created`,
      superUser?.id,
      { slug: result.tenant.slug }
    );
    await recordTenantAuditEvent(
      result.tenant.id,
      "workspace_created",
      `Primary workspace "${result.primaryWorkspace.name}" created`,
      superUser?.id,
      { workspaceId: result.primaryWorkspace.id, isPrimary: true }
    );

    res.status(201).json({
      ...result.tenant,
      primaryWorkspaceId: result.primaryWorkspace.id,
      primaryWorkspace: {
        id: result.primaryWorkspace.id,
        name: result.primaryWorkspace.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.log(`[TenantCreate] requestId=${requestId} validation_error details=${JSON.stringify(error.errors)}`);
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    
    const dbError = error as any;
    const errorInfo = {
      code: dbError?.code,
      constraint: dbError?.constraint,
      table: dbError?.table,
      detail: dbError?.detail,
    };
    
    console.error(`[TenantCreate] requestId=${requestId} failed actor=${superUser?.id} dbInfo=${JSON.stringify(errorInfo)}`, error);
    
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  status: z.enum([TenantStatus.ACTIVE, TenantStatus.INACTIVE, TenantStatus.SUSPENDED]).optional(),
  legalName: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  companySize: z.string().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal("")),
  taxId: z.string().optional().nullable(),
  foundedDate: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  primaryContactName: z.string().optional().nullable(),
  primaryContactEmail: z.string().email().optional().nullable().or(z.literal("")),
  primaryContactPhone: z.string().optional().nullable(),
  billingEmail: z.string().email().optional().nullable().or(z.literal("")),
});

tenantsRouter.patch("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const data = updateTenantSchema.parse(req.body);
    
    const tenant = await storage.updateTenant(req.params.id, data);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant:", error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

tenantsRouter.post("/tenants/:tenantId/activate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.ACTIVE) {
      return res.status(400).json({ error: "Tenant is already active" });
    }

    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.ACTIVE,
        activatedBySuperUserAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} activated by super user`);

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to active (activated by super user)`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "active" }
    );

    res.json({
      success: true,
      message: "Tenant activated successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error activating tenant:", error);
    res.status(500).json({ error: "Failed to activate tenant" });
  }
});

tenantsRouter.post("/tenants/:tenantId/suspend", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      return res.status(400).json({ error: "Tenant is already suspended" });
    }

    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.SUSPENDED,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} suspended by super user`);

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to suspended`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "suspended" }
    );

    res.json({
      success: true,
      message: "Tenant suspended successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error suspending tenant:", error);
    res.status(500).json({ error: "Failed to suspend tenant" });
  }
});

tenantsRouter.post("/tenants/:tenantId/deactivate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.INACTIVE) {
      return res.status(400).json({ error: "Tenant is already inactive" });
    }

    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.INACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} deactivated by super user`);

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to inactive`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "inactive" }
    );

    res.json({
      success: true,
      message: "Tenant deactivated successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error deactivating tenant:", error);
    res.status(500).json({ error: "Failed to deactivate tenant" });
  }
});

tenantsRouter.delete("/tenants/:tenantId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.ACTIVE) {
      return res.status(400).json({ 
        error: "Cannot delete an active tenant",
        details: "Suspend or deactivate the tenant first before deleting."
      });
    }

    const superUser = req.user!;
    console.log(`[SuperAdmin] Deleting tenant ${tenantId} (${tenant.name}) by super user ${superUser?.email}`);

    await db.transaction(async (tx) => {
      const tenantTaskIds = sql`ANY(SELECT id FROM tasks WHERE tenant_id = ${tenantId})`;
      const tenantSubtaskIds = sql`ANY(SELECT id FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = ${tenantId}))`;
      const tenantProjectIds = sql`ANY(SELECT id FROM projects WHERE tenant_id = ${tenantId})`;
      const tenantClientIds = sql`ANY(SELECT id FROM clients WHERE tenant_id = ${tenantId})`;
      const tenantWorkspaceIds = sql`ANY(SELECT id FROM workspaces WHERE tenant_id = ${tenantId})`;
      const tenantTeamIds = sql`ANY(SELECT id FROM teams WHERE tenant_id = ${tenantId})`;
      const tenantTicketIds = sql`ANY(SELECT id FROM support_tickets WHERE tenant_id = ${tenantId})`;
      const tenantConversationIds = sql`ANY(SELECT id FROM client_conversations WHERE tenant_id = ${tenantId})`;

      await tx.delete(chatMentions).where(eq(chatMentions.tenantId, tenantId));
      await tx.delete(chatPins).where(eq(chatPins.tenantId, tenantId));
      await tx.delete(chatAttachments).where(eq(chatAttachments.tenantId, tenantId));
      await tx.delete(chatMessageReactions).where(eq(chatMessageReactions.tenantId, tenantId));
      await tx.delete(chatReads).where(eq(chatReads.tenantId, tenantId));
      await tx.delete(chatExportJobs).where(eq(chatExportJobs.requestedByUserId, sql`ANY(SELECT id FROM users WHERE tenant_id = ${tenantId})`));
      await tx.delete(chatMessages).where(eq(chatMessages.tenantId, tenantId));
      await tx.delete(chatDmMembers).where(eq(chatDmMembers.tenantId, tenantId));
      await tx.delete(chatDmThreads).where(eq(chatDmThreads.tenantId, tenantId));
      await tx.delete(chatChannelMembers).where(eq(chatChannelMembers.tenantId, tenantId));
      await tx.delete(chatChannels).where(eq(chatChannels.tenantId, tenantId));

      await tx.delete(notifications).where(eq(notifications.tenantId, tenantId));
      await tx.delete(notificationPreferences).where(eq(notificationPreferences.tenantId, tenantId));

      await tx.delete(activeTimers).where(eq(activeTimers.tenantId, tenantId));
      await tx.delete(timeEntries).where(eq(timeEntries.tenantId, tenantId));

      await tx.delete(supportTicketMessages).where(eq(supportTicketMessages.ticketId, tenantTicketIds));
      await tx.delete(supportTicketEvents).where(eq(supportTicketEvents.ticketId, tenantTicketIds));
      await tx.delete(supportTickets).where(eq(supportTickets.tenantId, tenantId));
      await tx.delete(supportCannedReplies).where(eq(supportCannedReplies.tenantId, tenantId));
      await tx.delete(supportMacros).where(eq(supportMacros.tenantId, tenantId));
      await tx.delete(supportSlaPolicies).where(eq(supportSlaPolicies.tenantId, tenantId));
      await tx.delete(supportTicketFormSchemas).where(eq(supportTicketFormSchemas.tenantId, tenantId));

      await tx.delete(clientConversationReads).where(eq(clientConversationReads.conversationId, tenantConversationIds));
      await tx.delete(clientMessages).where(eq(clientMessages.conversationId, tenantConversationIds));
      await tx.delete(conversationSlaPolicies).where(eq(conversationSlaPolicies.tenantId, tenantId));
      await tx.delete(clientConversations).where(eq(clientConversations.tenantId, tenantId));
      await tx.delete(clientMessageTemplates).where(eq(clientMessageTemplates.tenantId, tenantId));

      await tx.delete(approvalRequests).where(eq(approvalRequests.tenantId, tenantId));

      await tx.delete(commentMentions).where(eq(commentMentions.commentId, sql`ANY(SELECT id FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = ${tenantId}))`));
      await tx.delete(comments).where(eq(comments.taskId, tenantTaskIds));

      await tx.delete(taskAttachments).where(eq(taskAttachments.taskId, tenantTaskIds));
      await tx.delete(taskTags).where(eq(taskTags.taskId, tenantTaskIds));
      await tx.delete(subtaskAssignees).where(eq(subtaskAssignees.subtaskId, tenantSubtaskIds));
      await tx.delete(subtaskTags).where(eq(subtaskTags.subtaskId, tenantSubtaskIds));
      await tx.delete(subtasks).where(eq(subtasks.taskId, tenantTaskIds));
      await tx.delete(taskWatchers).where(eq(taskWatchers.tenantId, tenantId));
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, tenantTaskIds));
      await tx.delete(activityLog).where(eq(activityLog.workspaceId, tenantWorkspaceIds));
      await tx.delete(personalTaskSections).where(eq(personalTaskSections.tenantId, tenantId));
      await tx.delete(tasks).where(eq(tasks.tenantId, tenantId));

      await tx.delete(tags).where(eq(tags.workspaceId, tenantWorkspaceIds));

      await tx.delete(sections).where(eq(sections.projectId, tenantProjectIds));
      await tx.delete(projectMembers).where(eq(projectMembers.projectId, tenantProjectIds));
      await tx.delete(hiddenProjects).where(eq(hiddenProjects.projectId, tenantProjectIds));
      await tx.delete(projectNoteVersions).where(eq(projectNoteVersions.noteId, sql`ANY(SELECT id FROM project_notes WHERE project_id IN (SELECT id FROM projects WHERE tenant_id = ${tenantId}))`));
      await tx.delete(projectNotes).where(eq(projectNotes.projectId, tenantProjectIds));
      await tx.delete(projectNoteCategories).where(eq(projectNoteCategories.tenantId, tenantId));
      await tx.delete(projectTemplates).where(eq(projectTemplates.tenantId, tenantId));
      await tx.delete(projects).where(eq(projects.tenantId, tenantId));

      await tx.delete(clientNoteAttachments).where(eq(clientNoteAttachments.noteId, sql`ANY(SELECT id FROM client_notes WHERE client_id IN (SELECT id FROM clients WHERE tenant_id = ${tenantId}))`));
      await tx.delete(clientNoteVersions).where(eq(clientNoteVersions.noteId, sql`ANY(SELECT id FROM client_notes WHERE client_id IN (SELECT id FROM clients WHERE tenant_id = ${tenantId}))`));
      await tx.delete(clientNotes).where(eq(clientNotes.clientId, tenantClientIds));
      await tx.delete(clientNoteCategories).where(eq(clientNoteCategories.tenantId, tenantId));

      await tx.delete(clientDocuments).where(eq(clientDocuments.clientId, tenantClientIds));
      await tx.delete(clientDocumentFolders).where(eq(clientDocumentFolders.clientId, tenantClientIds));
      await tx.delete(clientDocumentCategories).where(eq(clientDocumentCategories.tenantId, tenantId));

      await tx.delete(clientFiles).where(eq(clientFiles.clientId, tenantClientIds));

      await tx.delete(assetLinks).where(eq(assetLinks.tenantId, tenantId));
      await tx.delete(assets).where(eq(assets.tenantId, tenantId));
      await tx.delete(assetFolders).where(eq(assetFolders.tenantId, tenantId));

      await tx.delete(tenantDefaultDocuments).where(eq(tenantDefaultDocuments.tenantId, tenantId));
      await tx.delete(tenantDefaultFolders).where(eq(tenantDefaultFolders.tenantId, tenantId));

      await tx.delete(clientStageAutomationEvents).where(eq(clientStageAutomationEvents.tenantId, tenantId));
      await tx.delete(clientStageAutomationRules).where(eq(clientStageAutomationRules.tenantId, tenantId));
      await tx.delete(clientStageHistory).where(eq(clientStageHistory.clientId, tenantClientIds));

      await tx.delete(clientUserAccess).where(eq(clientUserAccess.clientId, tenantClientIds));
      await tx.delete(userClientAccess).where(eq(userClientAccess.clientId, tenantClientIds));
      await tx.delete(clientInvites).where(eq(clientInvites.clientId, tenantClientIds));
      await tx.delete(clientCrm).where(eq(clientCrm.clientId, tenantClientIds));
      await tx.delete(clientContacts).where(eq(clientContacts.clientId, tenantClientIds));

      await tx.delete(divisionMembers).where(eq(divisionMembers.tenantId, tenantId));
      await tx.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenantId));

      await tx.delete(clients).where(eq(clients.tenantId, tenantId));

      await tx.delete(teamMembers).where(eq(teamMembers.teamId, tenantTeamIds));
      await tx.delete(teams).where(eq(teams.tenantId, tenantId));

      await tx.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, tenantWorkspaceIds));
      await tx.delete(workspaces).where(eq(workspaces.tenantId, tenantId));

      await tx.delete(invitations).where(eq(invitations.tenantId, tenantId));

      await tx.delete(integrationEntityMap).where(eq(integrationEntityMap.tenantId, tenantId));
      await tx.delete(backgroundJobs).where(eq(backgroundJobs.tenantId, tenantId));
      await tx.delete(asanaImportRuns).where(eq(asanaImportRuns.tenantId, tenantId));

      await tx.delete(tenantNoteVersions).where(eq(tenantNoteVersions.noteId, sql`ANY(SELECT id FROM tenant_notes WHERE tenant_id = ${tenantId})`));
      await tx.delete(tenantNotes).where(eq(tenantNotes.tenantId, tenantId));
      await tx.delete(tenantAuditEvents).where(eq(tenantAuditEvents.tenantId, tenantId));
      await tx.delete(tenantAgreementAcceptances).where(eq(tenantAgreementAcceptances.tenantId, tenantId));
      await tx.delete(tenantAgreements).where(eq(tenantAgreements.tenantId, tenantId));
      await tx.delete(tenantIntegrations).where(eq(tenantIntegrations.tenantId, tenantId));
      await tx.delete(controlCenterWidgetLayouts).where(eq(controlCenterWidgetLayouts.tenantId, tenantId));
      await tx.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));

      await tx.delete(appSettings).where(eq(appSettings.tenantId, tenantId));
      await tx.delete(errorLogs).where(eq(errorLogs.tenantId, tenantId));
      await tx.delete(emailOutbox).where(eq(emailOutbox.tenantId, tenantId));
      await tx.delete(tenancyWarnings).where(eq(tenancyWarnings.effectiveTenantId, tenantId));

      await tx.delete(userUiPreferences).where(eq(userUiPreferences.userId, sql`ANY(SELECT id FROM users WHERE tenant_id = ${tenantId})`));
      await tx.delete(users).where(eq(users.tenantId, tenantId));

      await tx.delete(tenants).where(eq(tenants.id, tenantId));
    });

    console.log(`[SuperAdmin] Tenant ${tenantId} (${tenant.name}) deleted successfully`);

    await db.insert(platformAuditEvents).values({
      eventType: "tenant_deleted",
      message: `Tenant "${tenant.name}" (${tenantId}) permanently deleted`,
      actorUserId: superUser?.id,
      metadata: { tenantId, tenantName: tenant.name, tenantSlug: tenant.slug },
    });

    res.json({
      success: true,
      message: `Tenant "${tenant.name}" and all its data have been permanently deleted`,
    });
  } catch (error: any) {
    console.error("Error deleting tenant:", error);
    console.error("Error details:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint,
      table: error?.table,
      column: error?.column,
    });
    
    const errorMessage = error?.detail || error?.message || "Unknown error";
    const constraintInfo = error?.constraint ? ` (constraint: ${error.constraint})` : "";
    
    res.status(500).json({ 
      error: "Failed to delete tenant",
      details: `${errorMessage}${constraintInfo}`,
      code: error?.code,
    });
  }
});

const inviteAdminSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(["admin", "employee"]).optional().default("admin"),
  expiresInDays: z.number().min(1).max(30).optional(),
  inviteType: z.enum(["link", "email"]).optional().default("link"),
});

tenantsRouter.post("/tenants/:tenantId/invite-admin", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const data = inviteAdminSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let workspaceId: string;
    const tenantWorkspaces = await db.select().from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    if (tenantWorkspaces.length > 0) {
      const primaryWorkspace = tenantWorkspaces.find(w => w.isPrimary);
      workspaceId = primaryWorkspace?.id || tenantWorkspaces[0].id;
    } else {
      const [newWorkspace] = await db.insert(workspaces).values({
        name: `${tenant.name} Workspace`,
        tenantId,
        isPrimary: true,
      }).returning();
      workspaceId = newWorkspace.id;
    }

    const superUser = req.user!;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { invitation, token } = await storage.createTenantAdminInvitation({
      tenantId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      expiresInDays: data.expiresInDays,
      createdByUserId: superUser.id,
      workspaceId,
    });

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const inviteUrl = `${baseUrl}/invite/${token}`;

    let emailSent = false;
    let emailError: string | null = null;

    if (data.inviteType === "email") {
      try {
        const mailgunConfig = await tenantIntegrationService.getIntegrationWithSecrets(tenantId, "mailgun");
        
        if (mailgunConfig && mailgunConfig.publicConfig && mailgunConfig.secretConfig) {
          const { domain, fromEmail, replyTo } = mailgunConfig.publicConfig as { domain: string; fromEmail: string; replyTo?: string };
          const { apiKey } = mailgunConfig.secretConfig as { apiKey: string };
          
          const FormData = (await import("form-data")).default;
          const Mailgun = (await import("mailgun.js")).default;
          const mailgun = new Mailgun(FormData);
          const mg = mailgun.client({ username: "api", key: apiKey });
          
          await mg.messages.create(domain, {
            from: fromEmail,
            to: [data.email],
            subject: `You're invited to join ${tenant.name}`,
            text: `You've been invited to become an admin for ${tenant.name}.\n\nClick the link below to accept your invitation:\n${inviteUrl}\n\nThis invitation expires in ${data.expiresInDays || 7} days.`,
            html: `<p>You've been invited to become an admin for <strong>${tenant.name}</strong>.</p><p><a href="${inviteUrl}">Click here to accept your invitation</a></p><p>This invitation expires in ${data.expiresInDays || 7} days.</p>`,
            ...(replyTo ? { "h:Reply-To": replyTo } : {}),
          });
          
          emailSent = true;
        } else {
          emailError = "Mailgun is not configured for this tenant. The invite link has been generated instead.";
        }
      } catch (mailError) {
        console.error("Error sending invitation email:", mailError);
        emailError = "Failed to send email. The invite link has been generated instead.";
      }
    }

    await recordTenantAuditEvent(
      tenantId,
      "invite_created",
      `Admin invitation created for ${data.email}`,
      superUser.id,
      { email: data.email, role: "admin", emailSent }
    );

    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        tenantId: invitation.tenantId,
      },
      inviteUrl,
      inviteType: data.inviteType,
      emailSent,
      emailError,
      message: emailSent 
        ? `Email invitation sent to ${data.email}. The invite link has also been generated.`
        : "Invitation created successfully. Share the invite URL with the tenant admin.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant admin invitation:", error);
    res.status(500).json({ error: "Failed to create invitation" });
  }
});

tenantsRouter.get("/tenants/:tenantId/onboarding-status", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);

    res.json({
      status: tenant.status,
      onboardedAt: tenant.onboardedAt,
      ownerUserId: tenant.ownerUserId,
      settings: settings ? {
        displayName: settings.displayName,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        supportEmail: settings.supportEmail,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching tenant onboarding status:", error);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

tenantsRouter.get("/tenants-detail", requireSuperUser, async (req, res) => {
  try {
    const tenantsWithDetails = await storage.getTenantsWithDetails();
    res.json(tenantsWithDetails);
  } catch (error: any) {
    console.error("Error fetching tenants with details:", {
      message: error?.message,
      stack: error?.stack,
    });
    try {
      const basicTenants = await storage.getAllTenants();
      const tenantsWithDefaults = basicTenants.map(t => ({
        ...t,
        settings: null,
        userCount: 0,
      }));
      console.warn("[tenants-detail] Falling back to basic tenant list");
      res.json(tenantsWithDefaults);
    } catch (fallbackError: any) {
      console.error("Fallback also failed:", fallbackError?.message);
      res.status(500).json({ error: "Failed to fetch tenants", details: error?.message });
    }
  }
});

tenantsRouter.get("/tenants/picker", requireSuperUser, async (req, res) => {
  try {
    const searchQuery = req.query.q as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    let query = db.select({
      id: tenants.id,
      name: tenants.name,
      status: tenants.status,
    }).from(tenants);
    
    if (searchQuery && searchQuery.trim()) {
      query = query.where(ilike(tenants.name, `%${searchQuery.trim()}%`)) as any;
    }
    
    const results = await query.orderBy(tenants.name).limit(limit);
    
    res.json(results);
  } catch (error) {
    console.error("[tenants/picker] Failed to fetch tenants:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});
