/**
 * @file server/http/domains/status-reports.router.ts
 * @description Weekly Project Status Reports API
 *
 * POST /api/projects/:projectId/status-reports/generate  — Generate + store a report
 * GET  /api/projects/:projectId/status-reports            — List reports (paginated)
 * GET  /api/status-reports/:id                            — Get single report
 *
 * Access:
 * - Tenant Admin: all projects
 * - PM (project owner): only their own projects
 *
 * Feature flag: enableWeeklyStatusReports
 */

import { z } from "zod";
import { Router, Request, Response } from "express";
import { handleRouteError, AppError } from "../../lib/errors";
import { generateWeeklyStatusReport } from "../../ops/statusReports/statusReportGenerator";
import { config } from "../../config";
import { db } from "../../db";
import { projectStatusReports } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId } from "../../routes/helpers";

const router = Router();

function notEnabled(res: Response) {
  return res.status(404).json({ error: "Feature not enabled" });
}

async function assertProjectAccess(
  tenantId: string,
  projectId: string,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  if (isAdmin) return;
  const result = await db.execute(sql`
    SELECT 1 FROM project_members
    WHERE project_id = ${projectId}
      AND user_id = ${userId}
      AND role IN ('owner','member')
    LIMIT 1
  `);
  if (result.rows.length === 0) {
    throw AppError.forbidden("Access denied to this project");
  }
}

// POST /api/projects/:projectId/status-reports/generate
router.post("/:projectId/status-reports/generate", async (req: Request, res: Response) => {
  if (!config.features.enableWeeklyStatusReports) return notEnabled(res);

  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Tenant context required" });

    const userId = getCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const currentUser = req.user as any;
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_user" || currentUser?.role === "tenant_owner";

    const { projectId } = req.params;
    await assertProjectAccess(tenantId, projectId, userId, isAdmin);

    const bodySchema = z.object({
      rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
      rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.errors });
    }

    const { rangeStart, rangeEnd } = parsed.data;

    if (new Date(rangeStart) >= new Date(rangeEnd)) {
      return res.status(400).json({ error: "rangeStart must be before rangeEnd" });
    }

    const report = await generateWeeklyStatusReport({
      tenantId,
      projectId,
      rangeStart,
      rangeEnd,
      viewerUserId: userId,
    });

    return res.status(201).json(report);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:id/status-reports/generate", req);
  }
});

// GET /api/projects/:projectId/status-reports
router.get("/:projectId/status-reports", async (req: Request, res: Response) => {
  if (!config.features.enableWeeklyStatusReports) return notEnabled(res);

  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Tenant context required" });

    const userId = getCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const currentUser = req.user as any;
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_user" || currentUser?.role === "tenant_owner";

    const { projectId } = req.params;
    await assertProjectAccess(tenantId, projectId, userId, isAdmin);

    const limitParam = parseInt(req.query.limit as string) || 10;
    const limit = Math.min(limitParam, 50);

    const cursor = req.query.cursor as string | undefined;

    const reports = await db.execute(sql`
      SELECT
        psr.id,
        psr.project_id,
        psr.range_start,
        psr.range_end,
        psr.created_at,
        psr.is_sent,
        psr.sections_json,
        COALESCE(u.first_name || ' ' || u.last_name, u.email, 'System') AS generated_by_name
      FROM project_status_reports psr
      LEFT JOIN users u ON u.id = psr.generated_by_user_id
      WHERE psr.tenant_id = ${tenantId}
        AND psr.project_id = ${projectId}
        ${cursor ? sql`AND psr.created_at < ${cursor}::timestamp` : sql``}
      ORDER BY psr.range_end DESC
      LIMIT ${limit + 1}
    `);

    const rows = reports.rows as any[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    return res.json({ items, hasMore, nextCursor });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:id/status-reports", req);
  }
});

// GET /api/status-reports/:id
router.get("/:id", async (req: Request, res: Response) => {
  if (!config.features.enableWeeklyStatusReports) return notEnabled(res);

  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Tenant context required" });

    const userId = getCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const { id } = req.params;

    const result = await db.execute(sql`
      SELECT
        psr.*,
        COALESCE(u.first_name || ' ' || u.last_name, u.email, 'System') AS generated_by_name,
        p.name AS project_name
      FROM project_status_reports psr
      LEFT JOIN users u ON u.id = psr.generated_by_user_id
      LEFT JOIN projects p ON p.id = psr.project_id
      WHERE psr.id = ${id}
        AND psr.tenant_id = ${tenantId}
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/status-reports/:id", req);
  }
});

export default router;
