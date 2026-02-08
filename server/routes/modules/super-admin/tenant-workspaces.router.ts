import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { recordTenantAuditEvent } from '../../superAdmin';

export const tenantWorkspacesRouter = Router();

// GET /tenants/:tenantId/workspaces - Get all workspaces for a tenant
tenantWorkspacesRouter.get("/tenants/:tenantId/workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantWorkspaces = await db.select().from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));

    res.json(tenantWorkspaces);
  } catch (error) {
    console.error("Error fetching tenant workspaces:", error);
    res.status(500).json({ error: "Failed to fetch tenant workspaces" });
  }
});

// POST /tenants/:tenantId/workspaces - Create a workspace for a tenant
const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

tenantWorkspacesRouter.post("/tenants/:tenantId/workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createWorkspaceSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [workspace] = await db.insert(workspaces).values({
      name: data.name,
      tenantId,
    }).returning();

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "workspace_created",
      `Workspace "${data.name}" created by super admin`,
      superUser?.id,
      { workspaceId: workspace.id, workspaceName: data.name }
    );

    res.status(201).json(workspace);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating workspace:", error);
    res.status(500).json({ error: "Failed to create workspace" });
  }
});

// PATCH /tenants/:tenantId/workspaces/:workspaceId - Update a workspace
const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
});

tenantWorkspacesRouter.patch("/tenants/:tenantId/workspaces/:workspaceId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, workspaceId } = req.params;
    const data = updateWorkspaceSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingWorkspace] = await db.select().from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)));
    
    if (!existingWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const [updated] = await db.update(workspaces)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating workspace:", error);
    res.status(500).json({ error: "Failed to update workspace" });
  }
});

// DELETE /tenants/:tenantId/workspaces/:workspaceId - Delete a workspace
tenantWorkspacesRouter.delete("/tenants/:tenantId/workspaces/:workspaceId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, workspaceId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingWorkspace] = await db.select().from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)));
    
    if (!existingWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    const superUser = req.user!;
    await recordTenantAuditEvent(
      tenantId,
      "workspace_deleted",
      `Workspace "${existingWorkspace.name}" deleted by super admin`,
      superUser?.id,
      { workspaceId, workspaceName: existingWorkspace.name }
    );

    res.json({ success: true, message: "Workspace deleted successfully" });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    res.status(500).json({ error: "Failed to delete workspace" });
  }
});
