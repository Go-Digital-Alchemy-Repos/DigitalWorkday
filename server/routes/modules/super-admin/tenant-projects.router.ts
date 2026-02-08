import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { clients, projects, workspaces } from '@shared/schema';
import { eq, and, ilike, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { recordTenantAuditEvent } from '../../superAdmin';

export const tenantProjectsRouter = Router();

const bulkProjectSchema = z.object({
  projectName: z.string().min(1),
  clientCompanyName: z.string().optional(),
  clientId: z.string().optional(),
  workspaceName: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  color: z.string().optional(),
  projectOwnerEmail: z.string().email().optional(),
});

const bulkProjectsImportSchema = z.object({
  projects: z.array(bulkProjectSchema).min(1).max(500),
  options: z.object({
    autoCreateMissingClients: z.boolean().optional(),
  }).optional(),
});

tenantProjectsRouter.post("/tenants/:tenantId/projects/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = bulkProjectsImportSchema.parse(req.body);
    const autoCreateClients = data.options?.autoCreateMissingClients || false;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantWorkspaces = await db.select()
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    const primaryWorkspace = tenantWorkspaces.find(w => w.isPrimary) || tenantWorkspaces[0];
    if (!primaryWorkspace) {
      return res.status(400).json({ error: "No workspace found for tenant" });
    }
    const workspaceId = primaryWorkspace.id;
    const workspaceMap = new Map(tenantWorkspaces.map(w => [w.name.toLowerCase(), w.id]));

    const existingClients = await db.select({ companyName: clients.companyName, id: clients.id })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));
    const clientMap = new Map(existingClients.map(c => [c.companyName.toLowerCase(), c.id]));

    const existingProjects = await db.select({ name: projects.name, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.tenantId, tenantId));
    const existingProjectKeys = new Set(
      existingProjects.map(p => `${p.name.toLowerCase()}|${p.clientId || ""}`)
    );

    const createdClients: Array<{ name: string; id: string }> = [];

    const results: Array<{
      projectName: string;
      status: "created" | "skipped" | "error";
      reason?: string;
      projectId?: string;
      clientIdUsed?: string;
      workspaceIdUsed?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const projectData of data.projects) {
      const projectNameTrimmed = projectData.projectName.trim();
      let clientIdToUse: string | null = null;
      let workspaceIdToUse = workspaceId;

      if (projectData.workspaceName) {
        const wsId = workspaceMap.get(projectData.workspaceName.toLowerCase());
        if (wsId) {
          workspaceIdToUse = wsId;
        }
      }

      if (projectData.clientId) {
        clientIdToUse = projectData.clientId;
      } else if (projectData.clientCompanyName) {
        const clientNameLower = projectData.clientCompanyName.trim().toLowerCase();
        const existingClientId = clientMap.get(clientNameLower);
        
        if (existingClientId) {
          clientIdToUse = existingClientId;
        } else if (autoCreateClients) {
          try {
            const [newClient] = await db.insert(clients).values({
              tenantId,
              workspaceId: workspaceIdToUse,
              companyName: projectData.clientCompanyName.trim(),
              status: "active",
            }).returning();
            clientIdToUse = newClient.id;
            clientMap.set(clientNameLower, newClient.id);
            createdClients.push({ name: projectData.clientCompanyName.trim(), id: newClient.id });
          } catch (createErr: any) {
            results.push({
              projectName: projectNameTrimmed,
              status: "error",
              reason: `Failed to create client "${projectData.clientCompanyName}": ${createErr.message}`,
            });
            errors++;
            continue;
          }
        } else {
          results.push({
            projectName: projectNameTrimmed,
            status: "error",
            reason: `Client "${projectData.clientCompanyName}" not found. Import clients first or enable auto-create.`,
          });
          errors++;
          continue;
        }
      }

      const projectKey = `${projectNameTrimmed.toLowerCase()}|${clientIdToUse || ""}`;
      if (existingProjectKeys.has(projectKey)) {
        results.push({
          projectName: projectNameTrimmed,
          status: "skipped",
          reason: "Project with same name and client already exists",
        });
        skipped++;
        continue;
      }

      try {
        const [newProject] = await db.insert(projects).values({
          tenantId,
          workspaceId: workspaceIdToUse,
          clientId: clientIdToUse,
          name: projectNameTrimmed,
          description: projectData.description,
          status: projectData.status || "active",
          color: projectData.color || "#3B82F6",
        }).returning();

        results.push({
          projectName: projectNameTrimmed,
          status: "created",
          projectId: newProject.id,
          clientIdUsed: clientIdToUse || undefined,
          workspaceIdUsed: workspaceIdToUse,
        });
        created++;
        existingProjectKeys.add(projectKey);
      } catch (error: any) {
        results.push({
          projectName: projectNameTrimmed,
          status: "error",
          reason: error.message || "Failed to create project",
        });
        errors++;
      }
    }

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "projects_bulk_imported",
      `Bulk import: ${created} projects created, ${skipped} skipped, ${errors} errors${createdClients.length ? `, ${createdClients.length} clients auto-created` : ""}`,
      superUser?.id,
      { created, skipped, errors, total: data.projects.length, clientsCreated: createdClients.length }
    );

    res.status(201).json({
      created,
      skipped,
      errors,
      results,
      clientsCreated: createdClients,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("Error bulk importing projects:", error);
    res.status(500).json({ error: "Failed to bulk import projects" });
  }
});

tenantProjectsRouter.get("/tenants/:tenantId/projects", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const search = req.query.search as string || "";

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let query = db.select().from(projects).where(eq(projects.tenantId, tenantId));
    
    if (search) {
      query = db.select().from(projects)
        .where(and(
          eq(projects.tenantId, tenantId),
          ilike(projects.name, `%${search}%`)
        ));
    }

    const projectList = await query.orderBy(projects.name);

    const clientIds = Array.from(new Set(projectList.filter(p => p.clientId).map(p => p.clientId!)));
    let clientNameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const clientsData = await db.select({ id: clients.id, companyName: clients.companyName })
        .from(clients)
        .where(inArray(clients.id, clientIds));
      clientNameMap = new Map(clientsData.map(c => [c.id, c.companyName]));
    }

    const enrichedProjects = projectList.map(p => ({
      ...p,
      clientName: p.clientId ? clientNameMap.get(p.clientId) || null : null,
    }));

    res.json({ projects: enrichedProjects });
  } catch (error) {
    console.error("Error fetching tenant projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  clientId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  status: z.string().optional(),
  budgetMinutes: z.number().optional(),
});

tenantProjectsRouter.post("/tenants/:tenantId/projects", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createProjectSchema.parse(req.body);

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

    const [project] = await db.insert(projects).values({
      name: data.name,
      description: data.description || null,
      clientId: data.clientId || null,
      tenantId,
      workspaceId,
      status: data.status || "active",
      budgetMinutes: data.budgetMinutes || null,
    }).returning();

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "project_created",
      `Project "${data.name}" created by super admin`,
      superUser?.id,
      { projectId: project.id, projectName: data.name }
    );

    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  budgetMinutes: z.number().optional().nullable(),
});

tenantProjectsRouter.patch("/tenants/:tenantId/projects/:projectId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingProject] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));
    
    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [updated] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

tenantProjectsRouter.delete("/tenants/:tenantId/projects/:projectId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingProject] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));
    
    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    await db.delete(projects).where(eq(projects.id, projectId));

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "project_deleted",
      `Project "${existingProject.name}" deleted by super admin`,
      superUser?.id,
      { projectId, projectName: existingProject.name }
    );

    res.json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});
