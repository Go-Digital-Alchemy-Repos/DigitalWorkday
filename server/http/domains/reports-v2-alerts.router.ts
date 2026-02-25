import { Router, Request, Response } from "express";
import { handleRouteError } from "../../lib/errors";
import { reportingGuard, getTenantId } from "../../reports/utils";
import { db } from "../../db";
import { sql } from "drizzle-orm";

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

const VALID_RULE_TYPES = [
  "employee_overload",
  "employee_underutilized",
  "employee_low_compliance",
  "project_deadline_high_risk",
  "client_health_critical",
  "client_risk_worsening",
];

const VALID_SEVERITIES = ["info", "warning", "critical"];
const VALID_SCHEDULES = ["hourly", "daily", "weekly"];

// GET /alerts/rules
router.get("/alerts/rules", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rules = await dbRows(sql`
      SELECT * FROM alert_rules
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `);
    res.json({ rules });
  } catch (err) {
    return handleRouteError(res, err, "GET /alerts/rules", req);
  }
});

// POST /alerts/rules
router.post("/alerts/rules", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const user = req.user as { id: string };
    const {
      name, ruleType, severity, schedule, description,
      deliveryChannels, throttleMinutes, targetUserScope, targetUserIds, params,
    } = req.body;

    if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
    if (!ruleType || !VALID_RULE_TYPES.includes(ruleType)) {
      return res.status(400).json({ error: "Invalid ruleType" });
    }
    if (!severity || !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: "severity must be one of: " + VALID_SEVERITIES.join(", ") });
    }

    const rows = await dbRows(sql`
      INSERT INTO alert_rules (
        tenant_id, name, description, rule_type, severity, schedule,
        delivery_channels, throttle_minutes, target_user_scope, target_user_ids,
        params, is_enabled, created_by_user_id
      ) VALUES (
        ${tenantId}, ${name}, ${description ?? null}, ${ruleType},
        ${severity}, ${schedule ?? "daily"},
        ${JSON.stringify(deliveryChannels ?? ["in_app"])},
        ${throttleMinutes ?? 1440},
        ${targetUserScope ?? "tenant_admins"},
        ${JSON.stringify(targetUserIds ?? null)},
        ${JSON.stringify(params ?? {})},
        true,
        ${user?.id ?? null}
      )
      RETURNING *
    `);
    res.status(201).json(rows[0]);
  } catch (err) {
    return handleRouteError(res, err, "POST /alerts/rules", req);
  }
});

// PATCH /alerts/rules/:id
router.patch("/alerts/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const {
      name, ruleType, severity, schedule, description,
      deliveryChannels, throttleMinutes, targetUserScope, targetUserIds, params, isEnabled,
    } = req.body;

    const existing = await dbRows(sql`
      SELECT id FROM alert_rules WHERE id = ${id} AND tenant_id = ${tenantId}
    `);
    if (!existing.length) return res.status(404).json({ error: "Alert rule not found" });

    if (ruleType && !VALID_RULE_TYPES.includes(ruleType)) return res.status(400).json({ error: "Invalid ruleType" });
    if (severity && !VALID_SEVERITIES.includes(severity)) return res.status(400).json({ error: "Invalid severity" });

    const rows = await dbRows(sql`
      UPDATE alert_rules SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        rule_type = COALESCE(${ruleType ?? null}, rule_type),
        severity = COALESCE(${severity ?? null}, severity),
        schedule = COALESCE(${schedule ?? null}, schedule),
        delivery_channels = COALESCE(${deliveryChannels ? JSON.stringify(deliveryChannels) : null}::jsonb, delivery_channels),
        throttle_minutes = COALESCE(${throttleMinutes ?? null}, throttle_minutes),
        target_user_scope = COALESCE(${targetUserScope ?? null}, target_user_scope),
        target_user_ids = COALESCE(${targetUserIds ? JSON.stringify(targetUserIds) : null}::jsonb, target_user_ids),
        params = COALESCE(${params ? JSON.stringify(params) : null}::jsonb, params),
        is_enabled = COALESCE(${isEnabled ?? null}, is_enabled),
        updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING *
    `);
    res.json(rows[0]);
  } catch (err) {
    return handleRouteError(res, err, "PATCH /alerts/rules/:id", req);
  }
});

// DELETE /alerts/rules/:id
router.delete("/alerts/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const deleted = await dbRows(sql`
      DELETE FROM alert_rules WHERE id = ${id} AND tenant_id = ${tenantId} RETURNING id
    `);
    if (!deleted.length) return res.status(404).json({ error: "Alert rule not found" });
    res.json({ success: true });
  } catch (err) {
    return handleRouteError(res, err, "DELETE /alerts/rules/:id", req);
  }
});

// GET /alerts/events?limit=&offset=
router.get("/alerts/events", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 100);
    const offset = parseInt(req.query.offset as string || "0", 10);
    const ruleId = req.query.ruleId as string | undefined;

    const events = await dbRows(sql`
      SELECT e.*, r.name AS rule_name, r.rule_type
      FROM alert_events e
      LEFT JOIN alert_rules r ON r.id = e.rule_id
      WHERE e.tenant_id = ${tenantId}
        ${ruleId ? sql`AND e.rule_id = ${ruleId}` : sql``}
      ORDER BY e.triggered_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRows = await dbRows<{ count: string }>(sql`
      SELECT COUNT(*) FROM alert_events WHERE tenant_id = ${tenantId}
      ${ruleId ? sql`AND rule_id = ${ruleId}` : sql``}
    `);

    res.json({ events, total: parseInt(totalRows[0]?.count ?? "0", 10), limit, offset });
  } catch (err) {
    return handleRouteError(res, err, "GET /alerts/events", req);
  }
});

// PATCH /alerts/events/:id/acknowledge
router.patch("/alerts/events/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const rows = await dbRows(sql`
      UPDATE alert_events
      SET is_acknowledged = true, acknowledged_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING *
    `);
    if (!rows.length) return res.status(404).json({ error: "Alert event not found" });
    res.json(rows[0]);
  } catch (err) {
    return handleRouteError(res, err, "PATCH /alerts/events/:id/acknowledge", req);
  }
});

export default router;
