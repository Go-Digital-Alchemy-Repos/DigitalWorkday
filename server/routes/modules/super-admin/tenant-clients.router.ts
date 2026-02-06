import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { clients, clientContacts, clientDivisions, divisionMembers, clientUserAccess, clientInvites, projects, tasks, sections, projectMembers, taskAttachments, subtasks, taskTags, taskAssignees, taskWatchers, commentMentions, comments, activityLog, timeEntries, activeTimers, workspaces } from '@shared/schema';
import { eq, and, ilike, isNull, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { recordTenantAuditEvent } from '../../superAdmin';

export const tenantClientsRouter = Router();

const bulkClientSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactFirstName: z.string().optional(),
  primaryContactLastName: z.string().optional(),
});

const bulkClientsImportSchema = z.object({
  clients: z.array(bulkClientSchema).min(1).max(500),
});

tenantClientsRouter.post("/tenants/:tenantId/clients/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = bulkClientsImportSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const requestId = req.headers["x-request-id"] as string | undefined;
    const workspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

    const existingClients = await db.select({ companyName: clients.companyName, id: clients.id })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));
    const existingNamesLower = new Set(existingClients.map(c => c.companyName.toLowerCase()));

    const seenInCsv = new Set<string>();

    const results: Array<{
      companyName: string;
      status: "created" | "skipped" | "error";
      reason?: string;
      clientId?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const clientData of data.clients) {
      const companyNameLower = clientData.companyName.trim().toLowerCase();

      if (existingNamesLower.has(companyNameLower)) {
        results.push({
          companyName: clientData.companyName,
          status: "skipped",
          reason: "Client already exists in tenant",
        });
        skipped++;
        continue;
      }

      if (seenInCsv.has(companyNameLower)) {
        results.push({
          companyName: clientData.companyName,
          status: "skipped",
          reason: "Duplicate in CSV",
        });
        skipped++;
        continue;
      }
      seenInCsv.add(companyNameLower);

      try {
        const [newClient] = await db.insert(clients).values({
          tenantId,
          workspaceId,
          companyName: clientData.companyName.trim(),
          industry: clientData.industry,
          website: clientData.website,
          phone: clientData.phone,
          addressLine1: clientData.address1,
          addressLine2: clientData.address2,
          city: clientData.city,
          state: clientData.state,
          postalCode: clientData.zip,
          country: clientData.country,
          notes: clientData.notes,
          status: "active",
        }).returning();

        if (clientData.primaryContactEmail) {
          await db.insert(clientContacts).values({
            clientId: newClient.id,
            workspaceId,
            email: clientData.primaryContactEmail,
            firstName: clientData.primaryContactFirstName,
            lastName: clientData.primaryContactLastName,
            isPrimary: true,
          });
        }

        results.push({
          companyName: clientData.companyName,
          status: "created",
          clientId: newClient.id,
        });
        created++;
        existingNamesLower.add(companyNameLower);
      } catch (error: any) {
        results.push({
          companyName: clientData.companyName,
          status: "error",
          reason: error.message || "Failed to create client",
        });
        errors++;
      }
    }

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "clients_bulk_imported",
      `Bulk import: ${created} clients created, ${skipped} skipped, ${errors} errors`,
      superUser?.id,
      { created, skipped, errors, total: data.clients.length }
    );

    res.status(201).json({
      created,
      skipped,
      errors,
      results,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("Error bulk importing clients:", error);
    res.status(500).json({ error: "Failed to bulk import clients" });
  }
});

tenantClientsRouter.get("/tenants/:tenantId/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const search = req.query.search as string || "";

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let query = db.select().from(clients).where(eq(clients.tenantId, tenantId));
    
    if (search) {
      query = db.select().from(clients)
        .where(and(
          eq(clients.tenantId, tenantId),
          ilike(clients.companyName, `%${search}%`)
        ));
    }

    const clientList = await query.orderBy(clients.companyName);

    res.json({ clients: clientList });
  } catch (error) {
    console.error("Error fetching tenant clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

const createClientSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
});

tenantClientsRouter.post("/tenants/:tenantId/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createClientSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let workspaceId = data.workspaceId;
    if (!workspaceId) {
      const tenantWorkspaces = await db.select().from(workspaces)
        .where(eq(workspaces.tenantId, tenantId)).limit(1);
      if (tenantWorkspaces.length === 0) {
        return res.status(400).json({ error: "No workspace found for tenant. Create a workspace first." });
      }
      workspaceId = tenantWorkspaces[0].id;
    }

    const [client] = await db.insert(clients).values({
      companyName: data.companyName,
      email: data.email || null,
      phone: data.phone || null,
      tenantId,
      workspaceId,
    }).returning();

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "client_created",
      `Client "${data.companyName}" created by super admin`,
      superUser?.id,
      { clientId: client.id, clientName: data.companyName }
    );

    res.status(201).json(client);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating client:", error);
    res.status(500).json({ error: "Failed to create client" });
  }
});

tenantClientsRouter.post("/tenants/:tenantId/clients/fix-tenant-ids", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

    const tenantWorkspaceIds = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    const workspaceIdList = tenantWorkspaceIds.map(w => w.id);

    let orphanClientsInTenantWorkspaces: any[] = [];
    if (workspaceIdList.length > 0) {
      orphanClientsInTenantWorkspaces = await db.select()
        .from(clients)
        .where(and(
          isNull(clients.tenantId),
          inArray(clients.workspaceId, workspaceIdList)
        ));
    }

    const fullyOrphanClients = await db.select()
      .from(clients)
      .where(and(
        isNull(clients.tenantId),
        isNull(clients.workspaceId)
      ));

    const fixedClients: { id: string; companyName: string; action: string }[] = [];
    const fixErrors: { id: string; companyName: string; error: string }[] = [];

    for (const client of orphanClientsInTenantWorkspaces) {
      try {
        await db.update(clients)
          .set({ tenantId })
          .where(eq(clients.id, client.id));
        
        fixedClients.push({
          id: client.id,
          companyName: client.companyName,
          action: "Set tenantId"
        });
      } catch (err: any) {
        fixErrors.push({
          id: client.id,
          companyName: client.companyName,
          error: err.message
        });
      }
    }

    for (const client of fullyOrphanClients) {
      try {
        await db.update(clients)
          .set({ 
            tenantId,
            workspaceId: primaryWorkspaceId
          })
          .where(eq(clients.id, client.id));
        
        fixedClients.push({
          id: client.id,
          companyName: client.companyName,
          action: "Set tenantId and workspaceId"
        });
      } catch (err: any) {
        fixErrors.push({
          id: client.id,
          companyName: client.companyName,
          error: err.message
        });
      }
    }

    const superUser = req.user as any;
    if (fixedClients.length > 0) {
      await recordTenantAuditEvent(
        tenantId,
        "clients_tenant_ids_fixed",
        `Fixed ${fixedClients.length} orphan client(s) by super admin`,
        superUser?.id,
        { fixedClients, errors: fixErrors }
      );
    }

    console.log(`[FixClientTenantIds] Tenant ${tenantId}: Fixed ${fixedClients.length} clients, ${fixErrors.length} errors`);

    res.json({
      success: true,
      fixed: fixedClients.length,
      errors: fixErrors.length,
      fixedClients,
      errorDetails: fixErrors,
      message: fixedClients.length > 0 
        ? `Fixed ${fixedClients.length} client(s) with missing tenant association`
        : "No orphan clients found for this tenant"
    });
  } catch (error: any) {
    console.error("Error fixing client tenant IDs:", error);
    res.status(500).json({ 
      error: "Failed to fix client tenant IDs",
      details: error?.message || "Unknown error",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined
    });
  }
});

const updateClientSchema = z.object({
  companyName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
});

tenantClientsRouter.patch("/tenants/:tenantId/clients/:clientId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, clientId } = req.params;
    const data = updateClientSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingClient] = await db.select().from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
    
    if (!existingClient) {
      return res.status(404).json({ error: "Client not found" });
    }

    const [updated] = await db.update(clients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clients.id, clientId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating client:", error);
    res.status(500).json({ error: "Failed to update client" });
  }
});

tenantClientsRouter.delete("/tenants/:tenantId/clients/:clientId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, clientId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingClient] = await db.select().from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
    
    if (!existingClient) {
      return res.status(404).json({ error: "Client not found" });
    }

    await db.transaction(async (tx) => {
      const clientProjects = await tx.select({ id: projects.id })
        .from(projects)
        .where(eq(projects.clientId, clientId));
      const projectIds = clientProjects.map(p => p.id);

      const clientDivisionsList = await tx.select({ id: clientDivisions.id })
        .from(clientDivisions)
        .where(eq(clientDivisions.clientId, clientId));
      const divisionIds = clientDivisionsList.map(d => d.id);

      await tx.delete(timeEntries).where(eq(timeEntries.clientId, clientId));

      await tx.delete(activeTimers).where(eq(activeTimers.clientId, clientId));

      if (projectIds.length > 0) {
        const projectTasks = await tx.select({ id: tasks.id })
          .from(tasks)
          .where(inArray(tasks.projectId, projectIds));
        const taskIds = projectTasks.map(t => t.id);

        if (taskIds.length > 0) {
          await tx.delete(taskAttachments).where(inArray(taskAttachments.taskId, taskIds));
          await tx.delete(subtasks).where(inArray(subtasks.taskId, taskIds));
          await tx.delete(taskTags).where(inArray(taskTags.taskId, taskIds));
          await tx.delete(taskAssignees).where(inArray(taskAssignees.taskId, taskIds));
          await tx.delete(taskWatchers).where(inArray(taskWatchers.taskId, taskIds));
          const taskComments = await tx.select({ id: comments.id })
            .from(comments)
            .where(inArray(comments.taskId, taskIds));
          const commentIds = taskComments.map(c => c.id);
          if (commentIds.length > 0) {
            await tx.delete(commentMentions).where(inArray(commentMentions.commentId, commentIds));
          }
          await tx.delete(comments).where(inArray(comments.taskId, taskIds));
          await tx.delete(activityLog).where(
            and(eq(activityLog.entityType, "task"), inArray(activityLog.entityId, taskIds))
          );
          await tx.delete(tasks).where(inArray(tasks.id, taskIds));
        }

        await tx.delete(sections).where(inArray(sections.projectId, projectIds));
        await tx.delete(projectMembers).where(inArray(projectMembers.projectId, projectIds));
        await tx.delete(activityLog).where(
          and(eq(activityLog.entityType, "project"), inArray(activityLog.entityId, projectIds))
        );
        await tx.delete(projects).where(inArray(projects.id, projectIds));
      }

      if (divisionIds.length > 0) {
        await tx.delete(divisionMembers).where(inArray(divisionMembers.divisionId, divisionIds));
      }

      await tx.delete(clientUserAccess).where(eq(clientUserAccess.clientId, clientId));

      await tx.delete(clientInvites).where(eq(clientInvites.clientId, clientId));

      await tx.delete(clientDivisions).where(eq(clientDivisions.clientId, clientId));

      await tx.delete(clientContacts).where(eq(clientContacts.clientId, clientId));

      await tx.delete(clients).where(eq(clients.id, clientId));
    });

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "client_deleted",
      `Client "${existingClient.companyName}" deleted by super admin (with all related data)`,
      superUser?.id,
      { clientId, clientName: existingClient.companyName }
    );

    res.json({ success: true, message: "Client deleted successfully" });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ error: "Failed to delete client" });
  }
});
