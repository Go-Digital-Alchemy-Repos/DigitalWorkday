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
import {
  getClientProfitability,
  getTenantClientsProfitability,
} from "../../services/billing/clientProfitabilityService";
import { clients as clientsTable } from "@shared/schema";
import { db } from "../../db";
import { eq, inArray, sql } from "drizzle-orm";

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

function checkProfitabilityFlag(res: Response, req: Request): boolean {
  if (!config.features.enableClientProfitability) {
    sendError(res, AppError.forbidden("Client profitability feature is disabled"), req);
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

router.get("/analytics/client-profitability/:clientId", async (req: Request, res: Response) => {
  try {
    if (!checkProfitabilityFlag(res, req)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.unauthorized("Tenant context required"), req);

    const { clientId } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    const result = await getClientProfitability(clientId, tenantId, { startDate, endDate });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/analytics/client-profitability/:clientId", req);
  }
});

router.get("/analytics/client-profitability", async (req: Request, res: Response) => {
  try {
    if (!checkProfitabilityFlag(res, req)) return;

    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.unauthorized("Tenant context required"), req);

    const { startDate, endDate, marginThreshold } = req.query as {
      startDate?: string;
      endDate?: string;
      marginThreshold?: string;
    };

    const threshold = marginThreshold !== undefined ? parseFloat(marginThreshold) : undefined;
    const results = await getTenantClientsProfitability(tenantId, { startDate, endDate }, threshold);

    if (results.length > 0) {
      const clientIds = results.map((r) => r.clientId);
      const clientRows = await db
        .select({ id: clientsTable.id, name: clientsTable.companyName })
        .from(clientsTable)
        .where(inArray(clientsTable.id, clientIds));
      const nameMap = new Map(clientRows.map((c) => [c.id, c.name]));
      results.forEach((r) => { r.clientName = nameMap.get(r.clientId) ?? "Unknown"; });
    }

    res.json(results);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/analytics/client-profitability", req);
  }
});

router.get("/billing/billable-tasks/completed", async (req, res) => {
  try {
    if (!checkInvoiceFlag(res, req)) return;
    if (!checkPermission(req, res)) return;
    const tenantId = getEffectiveTenantId(req);

    const result = await db.execute(sql`
      SELECT
        t.id,
        t.title,
        t.description,
        t.updated_at AS completed_at,
        t.estimate_minutes,
        t.project_id,
        p.name AS project_name,
        COALESCE(te_agg.total_seconds, 0)::int AS actual_seconds
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN (
        SELECT task_id, SUM(duration_seconds) AS total_seconds
        FROM time_entries
        WHERE tenant_id = ${tenantId}
        GROUP BY task_id
      ) te_agg ON te_agg.task_id = t.id
      WHERE t.tenant_id = ${tenantId}
        AND t.status = 'done'
        AND t.is_billable = true
        AND t.is_personal = false
      ORDER BY t.updated_at DESC
      LIMIT 50
    `);

    const rows = result.rows ?? result ?? [];
    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/billing/billable-tasks/completed", req);
  }
});

export default router;
