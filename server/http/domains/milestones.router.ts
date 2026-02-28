import { z } from "zod";
import { createApiRouter } from "../routerFactory";
import { milestoneService } from "../../features/projects/milestoneService";
import { handleRouteError, AppError } from "../../lib/errors";
import { getCurrentUserId } from "../../routes/helpers";
import { config } from "../../config";
import type { Request, Response } from "express";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

function getEffectiveTenantId(req: Request): string | null {
  const user = req.user as any;
  return user?.tenantId || (req as any).tenant?.effectiveTenantId || null;
}

const createMilestoneSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  orderIndex: z.number().int().optional(),
});

const updateMilestoneSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  orderIndex: z.number().int().optional(),
});

const reorderSchema = z.object({
  updates: z.array(z.object({ id: z.string(), orderIndex: z.number().int() })).min(1),
});

router.get("/projects/:projectId/milestones", async (req: Request, res: Response) => {
  try {
    if (!config.features.enableProjectMilestones) return res.status(404).json({ error: "Feature not enabled" });

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const milestones = await milestoneService.getMilestonesForProject(tenantId, req.params.projectId);
    res.json(milestones);
  } catch (error) {
    return handleRouteError(res, error, "GET /projects/:projectId/milestones", req);
  }
});

router.post("/projects/:projectId/milestones", async (req: Request, res: Response) => {
  try {
    if (!config.features.enableProjectMilestones) return res.status(404).json({ error: "Feature not enabled" });

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const data = createMilestoneSchema.parse(req.body);
    const userId = getCurrentUserId(req);

    const milestone = await milestoneService.createMilestone({
      tenantId,
      projectId: req.params.projectId,
      name: data.name,
      description: data.description ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      orderIndex: data.orderIndex,
      createdByUserId: userId,
    });

    res.status(201).json(milestone);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: error.errors });
    return handleRouteError(res, error, "POST /projects/:projectId/milestones", req);
  }
});

router.put("/projects/:projectId/milestones/reorder", async (req: Request, res: Response) => {
  try {
    if (!config.features.enableProjectMilestones) return res.status(404).json({ error: "Feature not enabled" });

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const { updates } = reorderSchema.parse(req.body);
    await milestoneService.reorderMilestones(tenantId, updates);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: error.errors });
    return handleRouteError(res, error, "PUT /projects/:projectId/milestones/reorder", req);
  }
});

router.patch("/milestones/:id", async (req: Request, res: Response) => {
  try {
    if (!config.features.enableProjectMilestones) return res.status(404).json({ error: "Feature not enabled" });

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const data = updateMilestoneSchema.parse(req.body);
    const updated = await milestoneService.updateMilestone(tenantId, req.params.id, {
      ...data,
      dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
    });

    if (!updated) return res.status(404).json({ error: "Milestone not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: error.errors });
    return handleRouteError(res, error, "PATCH /milestones/:id", req);
  }
});

router.delete("/milestones/:id", async (req: Request, res: Response) => {
  try {
    if (!config.features.enableProjectMilestones) return res.status(404).json({ error: "Feature not enabled" });

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    await milestoneService.deleteMilestone(tenantId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /milestones/:id", req);
  }
});

export default router;
