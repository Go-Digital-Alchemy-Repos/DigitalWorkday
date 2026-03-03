/**
 * @file server/http/domains/whatif.router.ts
 * @description Capacity What-If Simulator API
 *
 * POST /api/ops/whatif/project — Run a capacity simulation for a project
 * POST /api/ops/whatif/project/snapshot — Save simulation result as a forecast snapshot
 *
 * Access:
 * - Tenant Admin: full access
 * - PM (employee): only for projects they own
 *
 * Safety: no DB writes occur during simulation. Writes only on /snapshot.
 */

import { z } from "zod";
import { createApiRouter } from "../routerFactory";
import { handleRouteError, AppError } from "../../lib/errors";
import { computeWhatIfScenario } from "../../ops/whatif/whatIfEngine";
import { config } from "../../config";
import { db } from "../../db";
import { forecastSnapshots } from "@shared/schema";
import { sql } from "drizzle-orm";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

const whatIfInputSchema = z.object({
  projectId: z.string().uuid(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
  changes: z.object({
    reassign: z
      .array(z.object({ taskId: z.string().uuid(), toUserId: z.string().uuid() }))
      .optional(),
    moveDueDate: z
      .array(z.object({ taskId: z.string().uuid(), newDueDate: z.string() }))
      .optional(),
    adjustEstimateHours: z
      .array(z.object({ taskId: z.string().uuid(), newEstimateHours: z.number().min(0).max(1000) }))
      .optional(),
  }),
});

router.post("/whatif/project", async (req, res) => {
  if (!config.features.enableCapacityWhatIf) {
    return res.status(404).json({ error: "Feature not enabled" });
  }

  try {
    const tenantId = req.tenantId!;
    const currentUser = req.user as any;
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_user";

    const parsed = whatIfInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { projectId, rangeStart, rangeEnd, changes } = parsed.data;

    // Permission check: PM can only run for their own projects
    if (!isAdmin) {
      const membership = await db.execute(sql`
        SELECT 1 FROM project_members
        WHERE project_id = ${projectId}
          AND user_id = ${currentUser.id}
          AND role = 'owner'
        LIMIT 1
      `);
      if (membership.rows.length === 0) {
        throw AppError.forbidden("You can only run simulations for projects you manage");
      }
    }

    const result = await computeWhatIfScenario({
      tenantId,
      projectId,
      rangeStart,
      rangeEnd,
      changes,
    });

    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/ops/whatif/project", req);
  }
});

router.post("/whatif/project/snapshot", async (req, res) => {
  if (!config.features.enableCapacityWhatIf || !config.features.enableWhatifSnapshots) {
    return res.status(404).json({ error: "Feature not enabled" });
  }

  try {
    const tenantId = req.tenantId!;
    const currentUser = req.user as any;

    const bodySchema = z.object({
      projectId: z.string().uuid(),
      rangeStart: z.string(),
      rangeEnd: z.string(),
      label: z.string().max(200).optional(),
      result: z.record(z.unknown()),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid snapshot data", details: parsed.error.errors });
    }

    const { projectId, rangeStart, rangeEnd, label, result } = parsed.data;

    const [snapshot] = await db
      .insert(forecastSnapshots)
      .values({
        tenantId,
        snapshotType: "whatif",
        horizonWeeks: 2,
        asOfDate: new Date(),
        rangeStart: new Date(rangeStart),
        rangeEnd: new Date(rangeEnd),
        entityScope: "project",
        entityId: projectId,
        payloadJson: { label: label || "What-if Scenario", ...result },
        confidence: "Medium",
        dataQualityFlags: [],
        createdByUserId: currentUser.id,
      })
      .returning({ id: forecastSnapshots.id });

    return res.json({ snapshotId: snapshot.id, saved: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/ops/whatif/project/snapshot", req);
  }
});

export default router;
