import { Request, Response } from "express";
import { createApiRouter } from "../routerFactory";
import { DatabaseStorage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId } from "../../middleware/authContext";
import { UserRole, insertClientStageAutomationRuleSchema } from "@shared/schema";
import { AppError, handleRouteError, sendError } from "../../lib/errors";
import { evaluateDryRun, type AutomationEvent } from "../../features/automation/clientStageAutomation.service";
import { z } from "zod";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

const storage = new DatabaseStorage();

function requireAdminRole(req: Request, res: Response): boolean {
  const role = (req.user as any)?.role;
  if (role !== UserRole.ADMIN && role !== UserRole.SUPER_USER) {
    sendError(res, AppError.forbidden("Admin access required"), req);
    return false;
  }
  return true;
}

router.get("/automation/client-stage-rules", async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.badRequest("Tenant context required"), req);

    const rules = await storage.getAutomationRulesByTenant(tenantId);
    res.json(rules);
  } catch (error) {
    return handleRouteError(res, error, "GET /automation/client-stage-rules", req);
  }
});

router.post("/automation/client-stage-rules", async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.badRequest("Tenant context required"), req);
    const userId = getCurrentUserId(req);

    const body = insertClientStageAutomationRuleSchema.parse({
      ...req.body,
      tenantId,
      createdByUserId: userId,
    });

    const rule = await storage.createAutomationRule(body);
    res.status(201).json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /automation/client-stage-rules", req);
  }
});

router.patch("/automation/client-stage-rules/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.badRequest("Tenant context required"), req);

    const existing = await storage.getAutomationRule(req.params.id, tenantId);
    if (!existing) return sendError(res, AppError.notFound("Automation rule"), req);

    const updates = req.body;
    const rule = await storage.updateAutomationRule(req.params.id, tenantId, updates);
    res.json(rule);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /automation/client-stage-rules/:id", req);
  }
});

router.delete("/automation/client-stage-rules/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.badRequest("Tenant context required"), req);

    const deleted = await storage.deleteAutomationRule(req.params.id, tenantId);
    if (!deleted) return sendError(res, AppError.notFound("Automation rule"), req);

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /automation/client-stage-rules/:id", req);
  }
});

router.post("/automation/client-stage-rules/:id/dry-run", async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.badRequest("Tenant context required"), req);
    const userId = getCurrentUserId(req);

    const rule = await storage.getAutomationRule(req.params.id, tenantId);
    if (!rule) return sendError(res, AppError.notFound("Automation rule"), req);

    const { clientId, projectId } = req.body;
    if (!clientId) return sendError(res, AppError.badRequest("clientId is required for dry-run"), req);

    const event: AutomationEvent = {
      tenantId,
      clientId,
      projectId: projectId || undefined,
      triggerType: rule.triggerType as any,
      payload: req.body.payload || {},
      userId,
    };

    const results = await evaluateDryRun(event);
    res.json({ results, rule });
  } catch (error) {
    return handleRouteError(res, error, "POST /automation/client-stage-rules/:id/dry-run", req);
  }
});

router.get("/automation/client-stage-events", async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.badRequest("Tenant context required"), req);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const events = await storage.getAutomationEvents(tenantId, limit);
    res.json(events);
  } catch (error) {
    return handleRouteError(res, error, "GET /automation/client-stage-events", req);
  }
});

export default router;
