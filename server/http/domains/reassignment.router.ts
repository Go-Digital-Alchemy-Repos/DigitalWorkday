/**
 * @file server/http/domains/reassignment.router.ts
 * @description Workforce reassignment suggestions API.
 *
 * Routes:
 *   GET /api/ops/reassignment-suggestions  — list suggestions (admin always, PM scoped)
 *   POST /api/ops/reassignment-suggestions/apply — apply a single suggestion
 *
 * Feature-flagged: ENABLE_REASSIGNMENT_SUGGESTIONS
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { config } from "../../config";
import { getReassignmentSuggestions } from "../../ops/reassignment/reassignmentSuggestionEngine";
import { handleRouteError } from "../../lib/errors";
import { db } from "../../db";
import { sql } from "drizzle-orm";

const router = Router();

const querySchema = z.object({
  projectId: z.string().optional(),
  rangeStart: z.string().optional(),
  rangeEnd: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

router.get("/reassignment-suggestions", async (req: Request, res: Response) => {
  try {
    if (!config.features.enableReassignmentSuggestions) {
      return res.json({ suggestions: [], meta: null, disabled: true });
    }

    const user = req.user as { id: string; role: string; tenantId: string } | undefined;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const tenantId = req.tenant?.effectiveTenantId ?? user.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { projectId, limit } = parsed.data;

    const now = new Date();
    const rangeStart = parsed.data.rangeStart ? new Date(parsed.data.rangeStart) : now;
    const rangeEnd = parsed.data.rangeEnd
      ? new Date(parsed.data.rangeEnd)
      : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const isAdmin = user.role === "admin" || user.role === "super_user";
    let pmUserId: string | undefined;

    if (!isAdmin) {
      if (user.role !== "employee") {
        return res.status(403).json({ error: "Access denied" });
      }
      pmUserId = user.id;
    }

    const debugMode = config.features.enableSuggestionDebug && req.query.debug === "1";

    const result = await getReassignmentSuggestions({
      tenantId,
      pmUserId,
      projectId,
      rangeStart,
      rangeEnd,
      limit,
      debugMode,
    });

    res.json(result);
  } catch (error) {
    handleRouteError(res, error, "GET /api/ops/reassignment-suggestions", req);
  }
});

const applySchema = z.object({
  taskId: z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
});

router.post("/reassignment-suggestions/apply", async (req: Request, res: Response) => {
  try {
    if (!config.features.enableReassignmentSuggestions) {
      return res.status(403).json({ error: "Feature disabled" });
    }

    const user = req.user as { id: string; role: string; tenantId: string } | undefined;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const tenantId = req.tenant?.effectiveTenantId ?? user.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const isAdmin = user.role === "admin" || user.role === "super_user";
    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can apply reassignment suggestions" });
    }

    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { taskId, fromUserId, toUserId } = parsed.data;

    const taskCheck = await db.execute(sql`
      SELECT id FROM tasks WHERE id = ${taskId} AND tenant_id = ${tenantId} LIMIT 1
    `);
    if (!taskCheck.rows.length) {
      return res.status(404).json({ error: "Task not found" });
    }

    await db.execute(sql`
      DELETE FROM task_assignees
      WHERE task_id = ${taskId} AND user_id = ${fromUserId} AND tenant_id = ${tenantId}
    `);

    await db.execute(sql`
      INSERT INTO task_assignees (task_id, user_id, tenant_id)
      VALUES (${taskId}, ${toUserId}, ${tenantId})
      ON CONFLICT DO NOTHING
    `);

    res.json({ success: true, taskId, fromUserId, toUserId });
  } catch (error) {
    handleRouteError(res, error, "POST /api/ops/reassignment-suggestions/apply", req);
  }
});

export default router;
