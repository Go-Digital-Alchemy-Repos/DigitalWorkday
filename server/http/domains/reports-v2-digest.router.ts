import { Router, Request, Response } from "express";
import { handleRouteError } from "../../lib/errors";
import { reportingGuard, getTenantId } from "../../reports/utils";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { generateDigest } from "../../digests/generateOpsDigest";

const router = Router();
router.use(reportingGuard);

async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

// GET /digest/schedule
router.get("/digest/schedule", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await dbRows(sql`
      SELECT * FROM ops_digest_schedules WHERE tenant_id = ${tenantId} LIMIT 1
    `);
    res.json(rows[0] ?? null);
  } catch (err) {
    return handleRouteError(res, err, "GET /digest/schedule", req);
  }
});

// PUT /digest/schedule
router.put("/digest/schedule", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const {
      isEnabled, dayOfWeek, hourLocal, timezone,
      recipientsScope, targetUserIds, includeSections,
    } = req.body;

    const rows = await dbRows(sql`
      INSERT INTO ops_digest_schedules (
        tenant_id, is_enabled, day_of_week, hour_local, timezone,
        recipients_scope, target_user_ids, include_sections
      ) VALUES (
        ${tenantId},
        ${isEnabled ?? true},
        ${dayOfWeek ?? 1},
        ${hourLocal ?? 9},
        ${timezone ?? "UTC"},
        ${recipientsScope ?? "tenant_admins"},
        ${JSON.stringify(targetUserIds ?? null)},
        ${JSON.stringify(includeSections ?? ["top_overloads", "projects_at_risk", "clients_at_risk"])}
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        day_of_week = EXCLUDED.day_of_week,
        hour_local = EXCLUDED.hour_local,
        timezone = EXCLUDED.timezone,
        recipients_scope = EXCLUDED.recipients_scope,
        target_user_ids = EXCLUDED.target_user_ids,
        include_sections = EXCLUDED.include_sections,
        updated_at = NOW()
      RETURNING *
    `);
    res.json(rows[0]);
  } catch (err) {
    return handleRouteError(res, err, "PUT /digest/schedule", req);
  }
});

// POST /digest/preview
router.post("/digest/preview", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const sections = await generateDigest(tenantId);
    res.json(sections);
  } catch (err) {
    return handleRouteError(res, err, "POST /digest/preview", req);
  }
});

export default router;
