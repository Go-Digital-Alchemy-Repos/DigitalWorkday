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
import {
  generateInvoiceDraft,
  getInvoiceDrafts,
  getInvoiceDraftById,
  exportInvoiceDraft,
  cancelInvoiceDraft,
} from "../../services/billing/invoiceDraftService";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

function checkFeatureFlag(res: Response, req: Request): boolean {
  if (!config.features.enableBillingApprovalWorkflow) {
    sendError(res, AppError.forbidden("Billing approval workflow feature is disabled"), req);
    return false;
  }
  return true;
}

function checkInvoiceFlag(res: Response, req: Request): boolean {
  if (!config.features.enableInvoiceDraftBuilder) {
    sendError(res, AppError.forbidden("Invoice draft builder feature is disabled"), req);
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

const generateDraftSchema = z.object({
  clientId: z.string().min(1, "Client ID required"),
  projectId: z.string().optional().nullable(),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().min(1, "End date required"),
  defaultRate: z.number().min(0).optional().default(0),
  notes: z.string().optional(),
});

router.post("/billing/generate-invoice-draft", async (req: Request, res: Response) => {
  try {
    if (!checkInvoiceFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.unauthorized("Tenant context required"), req);

    const parsed = generateDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, AppError.badRequest(parsed.error.errors[0]?.message || "Invalid input"), req);
    }

    const userId = (req.user as any)?.id;
    const draft = await generateInvoiceDraft({
      tenantId,
      clientId: parsed.data.clientId,
      projectId: parsed.data.projectId,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      createdByUserId: userId,
      defaultRate: parsed.data.defaultRate,
      notes: parsed.data.notes,
    });

    res.json(draft);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/billing/generate-invoice-draft", req);
  }
});

router.get("/billing/invoice-drafts", async (req: Request, res: Response) => {
  try {
    if (!checkInvoiceFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.unauthorized("Tenant context required"), req);

    const drafts = await getInvoiceDrafts(tenantId);
    res.json(drafts);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/billing/invoice-drafts", req);
  }
});

router.get("/billing/invoice-drafts/:id", async (req: Request, res: Response) => {
  try {
    if (!checkInvoiceFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.unauthorized("Tenant context required"), req);

    const draft = await getInvoiceDraftById(req.params.id, tenantId);
    if (!draft) return sendError(res, AppError.notFound("Invoice draft"), req);

    res.json(draft);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/billing/invoice-drafts/:id", req);
  }
});

router.post("/billing/invoice-drafts/:id/export", async (req: Request, res: Response) => {
  try {
    if (!checkInvoiceFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.unauthorized("Tenant context required"), req);

    const result = await exportInvoiceDraft(req.params.id, tenantId);
    res.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/billing/invoice-drafts/:id/export", req);
  }
});

router.post("/billing/invoice-drafts/:id/cancel", async (req: Request, res: Response) => {
  try {
    if (!checkInvoiceFlag(res, req)) return;
    if (!checkPermission(req, res)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.unauthorized("Tenant context required"), req);

    await cancelInvoiceDraft(req.params.id, tenantId);
    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/billing/invoice-drafts/:id/cancel", req);
  }
});

export default router;
