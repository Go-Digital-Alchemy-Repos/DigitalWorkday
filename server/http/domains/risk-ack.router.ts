/**
 * @file server/http/domains/risk-ack.router.ts
 * @description Risk Acknowledgment Workflow API
 *
 * GET  /api/projects/:projectId/risk-ack/status — Current risk state + ack status
 * POST /api/projects/:projectId/risk-ack        — Submit an acknowledgment
 *
 * Access:
 * - Tenant Admin: all projects
 * - PM (project owner): only their own projects
 *
 * Feature flag: enableRiskAckWorkflow
 */

import { z } from "zod";
import { Router, Request, Response } from "express";
import { handleRouteError, AppError } from "../../lib/errors";
import { getRiskAckStatus, acknowledgeRisk } from "../../ops/risk/riskAckService";
import { config } from "../../config";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId } from "../../routes/helpers";

const router = Router();

function notEnabled(res: Response) {
  return res.status(404).json({ error: "Feature not enabled" });
}

router.get("/:projectId/risk-ack/status", async (req: Request, res: Response) => {
  if (!config.features.enableRiskAckWorkflow) return notEnabled(res);

  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Tenant context required" });

    const { projectId } = req.params;
    const status = await getRiskAckStatus(tenantId, projectId);
    return res.json(status);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:id/risk-ack/status", req);
  }
});

const ackBodySchema = z.object({
  mitigationNote: z.string().max(2000).optional(),
  nextCheckInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post("/:projectId/risk-ack", async (req: Request, res: Response) => {
  if (!config.features.enableRiskAckWorkflow) return notEnabled(res);

  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Tenant context required" });

    const userId = getCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const currentUser = req.user as any;
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_user" || currentUser?.role === "tenant_owner";

    const { projectId } = req.params;

    // Permission: admin or project owner (PM)
    if (!isAdmin) {
      const membership = await db.execute(sql`
        SELECT 1 FROM project_members
        WHERE project_id = ${projectId}
          AND user_id = ${userId}
          AND role = 'owner'
        LIMIT 1
      `);
      if (membership.rows.length === 0) {
        throw AppError.forbidden("Only the project owner or admin can acknowledge risk");
      }
    }

    const parsed = ackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const ack = await acknowledgeRisk({
      tenantId,
      projectId,
      userId,
      mitigationNote: parsed.data.mitigationNote,
      nextCheckInDate: parsed.data.nextCheckInDate,
    });

    return res.status(201).json(ack);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:id/risk-ack", req);
  }
});

export default router;
