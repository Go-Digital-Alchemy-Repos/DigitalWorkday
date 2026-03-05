import { Request, Response } from "express";
import { createApiRouter } from "../routerFactory";
import { AppError, handleRouteError, sendError } from "../../lib/errors";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { config } from "../../config";
import { z } from "zod";
import {
  submitTimeForApproval,
  approveTimeEntries,
  rejectTimeEntries,
  getPendingApprovalQueue,
} from "../../services/billing/billingApprovalService";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

function checkFeatureFlag(res: Response, req: Request): boolean {
  if (!config.features.enableBillingApprovalWorkflow) {
    sendError(res, AppError.forbidden("Billing approval workflow feature is disabled"), req);
    return false;
  }
  return true;
}

function checkPermission(req: Request, res: Response): boolean {
  const user = req.user as any;
  const role = user?.role;
  const isProjectManager = user?.isProjectManager === true;
  const allowed =
    role === "super_user" ||
    role === "tenant_owner" ||
    (role === "admin" && isProjectManager);
  if (!allowed) {
    sendError(res, AppError.forbidden("Only Tenant Admins or Project Managers can manage billing approvals"), req);
    return false;
  }
  return true;
}

const idsSchema = z.object({
  timeEntryIds: z.array(z.string()).min(1, "At least one time entry ID required"),
});

router.get("/billing/pending-approval", async (req: Request, res: Response) => {
  try {
    if (!checkFeatureFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return sendError(res, AppError.unauthorized("Tenant context required"), req);
    }

    const queue = await getPendingApprovalQueue(tenantId);
    res.json(queue);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/billing/pending-approval", req);
  }
});

router.post("/billing/submit-approval", async (req: Request, res: Response) => {
  try {
    if (!checkFeatureFlag(res, req)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return sendError(res, AppError.unauthorized("Tenant context required"), req);
    }

    const parsed = idsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, AppError.badRequest(parsed.error.errors[0]?.message || "Invalid input"), req);
    }

    const result = await submitTimeForApproval(parsed.data.timeEntryIds, tenantId);
    res.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/billing/submit-approval", req);
  }
});

router.post("/billing/approve", async (req: Request, res: Response) => {
  try {
    if (!checkFeatureFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return sendError(res, AppError.unauthorized("Tenant context required"), req);
    }

    const parsed = idsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, AppError.badRequest(parsed.error.errors[0]?.message || "Invalid input"), req);
    }

    const result = await approveTimeEntries(parsed.data.timeEntryIds, tenantId);
    res.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/billing/approve", req);
  }
});

router.post("/billing/reject", async (req: Request, res: Response) => {
  try {
    if (!checkFeatureFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return sendError(res, AppError.unauthorized("Tenant context required"), req);
    }

    const parsed = idsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, AppError.badRequest(parsed.error.errors[0]?.message || "Invalid input"), req);
    }

    const result = await rejectTimeEntries(parsed.data.timeEntryIds, tenantId);
    res.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/billing/reject", req);
  }
});

export default router;
