import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  computeCapacityOverload,
  computeProjectDeadlineRisk,
  computeClientRiskTrend,
  isoDate,
  addDays,
} from "../reports/forecasting/snapshotService";
import { storage } from "../storage";
import { emailOutboxService } from "../services/emailOutbox";


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

interface AlertRuleRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  ruleType: string;
  severity: string;
  schedule: string;
  deliveryChannels: string[];
  throttleMinutes: number;
  targetUserScope: string;
  targetUserIds: string[] | null;
  params: Record<string, unknown> | null;
  isEnabled: boolean;
  lastRunAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

interface AlertEventInsert {
  tenantId: string;
  ruleId: string;
  eventKey: string;
  entityType: string;
  entityId: string;
  entityName: string;
  severity: string;
  title: string;
  message: string;
  payloadJson?: unknown;
}

function startOfWeekIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

async function insertAlertEvent(event: AlertEventInsert): Promise<{ id: string; isNew: boolean }> {
  const rows = await dbRows<{ id: string }>(sql`
    INSERT INTO alert_events (
      tenant_id, rule_id, event_key, entity_type, entity_id, entity_name,
      severity, title, message, payload_json
    ) VALUES (
      ${event.tenantId}, ${event.ruleId}, ${event.eventKey},
      ${event.entityType}, ${event.entityId}, ${event.entityName},
      ${event.severity}, ${event.title}, ${event.message},
      ${JSON.stringify(event.payloadJson ?? {})}
    )
    ON CONFLICT (tenant_id, event_key) DO NOTHING
    RETURNING id
  `);
  if (rows.length > 0) {
    return { id: rows[0].id, isNew: true };
  }
  return { id: "", isNew: false };
}

async function getRecipientUsers(
  tenantId: string,
  scope: string,
  customIds: string[] | null
): Promise<Array<{ userId: string; email: string }>> {
  if (scope === "custom" && customIds && customIds.length > 0) {
    const rows = await dbRows<{ id: string; email: string }>(sql`
      SELECT id, email FROM users
      WHERE tenant_id = ${tenantId} AND id = ANY(${customIds}) AND is_active = true
    `);
    return rows.map((r) => ({ userId: r.id, email: r.email }));
  }
  const roles = scope === "project_managers"
    ? ["project_manager", "admin", "super_user"]
    : ["admin", "super_user"];
  const rows = await dbRows<{ id: string; email: string }>(sql`
    SELECT id, email FROM users
    WHERE tenant_id = ${tenantId} AND role = ANY(${roles}::text[]) AND is_active = true
  `);
  return rows.map((r) => ({ userId: r.id, email: r.email }));
}

async function deliverAlertNotifications(
  rule: AlertRuleRow,
  event: AlertEventInsert,
  eventId: string
): Promise<void> {
  const recipients = await getRecipientUsers(
    rule.tenantId,
    rule.targetUserScope,
    rule.targetUserIds
  );

  const deliverInApp = rule.deliveryChannels.includes("in_app");
  const deliverEmail = rule.deliveryChannels.includes("email");

  const href = ["employee_overload", "employee_underutilized", "employee_low_compliance"].includes(rule.ruleType)
    ? "/reports/employee-cc"
    : "/reports/client-cc";

  for (const recipient of recipients) {
    if (deliverInApp) {
      try {
        await storage.createOrDedupeNotification({
          tenantId: rule.tenantId,
          userId: recipient.userId,
          type: "other",
          severity: rule.severity as "info" | "warning" | "error",
          title: event.title,
          message: event.message,
          href,
          dedupeKey: `alert-event:${eventId}:${recipient.userId}`,
          payloadJson: { alertRuleId: rule.id, alertEventId: eventId, entityId: event.entityId },
        });
      } catch (err) {
        console.warn({ err }, "Failed to create in-app notification for alert event");
      }
    }

    if (deliverEmail) {
      try {
        await emailOutboxService.sendEmail({
          tenantId: rule.tenantId,
          messageType: "other",
          toEmail: recipient.email,
          subject: `[Alert] ${event.title}`,
          textBody: `${event.message}\n\nView details: ${href}`,
          metadata: { alertRuleId: rule.id, alertEventId: eventId },
        });
      } catch (err) {
        console.warn({ err }, "Failed to send email notification for alert event");
      }
    }
  }
}

async function evaluateRule(rule: AlertRuleRow, now: Date): Promise<void> {
  const weekStart = startOfWeekIso();
  const horizonWeeks = (rule.params?.horizonWeeks as number) ?? 4;
  const horizonWks = ([2, 4, 8].includes(horizonWeeks) ? horizonWeeks : 4) as 2 | 4 | 8;

  switch (rule.ruleType) {
    case "employee_overload": {
      const result = await computeCapacityOverload(rule.tenantId, horizonWks);
      for (const user of result.users) {
        const isOverloaded = user.weeks.some((w) => w.overloadRisk === "High");
        if (!isOverloaded) continue;
        const peakWeek = user.weeks.reduce((a, b) =>
          a.predictedUtilizationPct > b.predictedUtilizationPct ? a : b
        );
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
        const eventKey = `${rule.id}:${user.userId}:${weekStart}`;
        const inserted = await insertAlertEvent({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          eventKey,
          entityType: "user",
          entityId: user.userId,
          entityName: name,
          severity: rule.severity,
          title: `Capacity Overload: ${name}`,
          message: `${name} is predicted at ${peakWeek.predictedUtilizationPct}% capacity on week of ${peakWeek.weekStart} — High overload risk.`,
          payloadJson: { userId: user.userId, peakWeek },
        });
        if (inserted.isNew) {
          await deliverAlertNotifications(rule, {
            tenantId: rule.tenantId, ruleId: rule.id, eventKey,
            entityType: "user", entityId: user.userId, entityName: name,
            severity: rule.severity,
            title: `Capacity Overload: ${name}`,
            message: `${name} is predicted at ${peakWeek.predictedUtilizationPct}% capacity — High overload risk.`,
          }, inserted.id);
        }
      }
      break;
    }

    case "employee_underutilized": {
      const result = await computeCapacityOverload(rule.tenantId, horizonWks);
      for (const user of result.users) {
        const avgUtilization = user.weeks.length > 0
          ? user.weeks.reduce((s, w) => s + w.predictedUtilizationPct, 0) / user.weeks.length
          : 0;
        if (avgUtilization >= 50) continue;
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
        const eventKey = `${rule.id}:${user.userId}:${weekStart}`;
        const inserted = await insertAlertEvent({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          eventKey,
          entityType: "user",
          entityId: user.userId,
          entityName: name,
          severity: rule.severity,
          title: `Underutilized: ${name}`,
          message: `${name} is predicted at only ${Math.round(avgUtilization)}% avg capacity over the next ${horizonWks} weeks.`,
          payloadJson: { userId: user.userId, avgUtilization },
        });
        if (inserted.isNew) {
          await deliverAlertNotifications(rule, {
            tenantId: rule.tenantId, ruleId: rule.id, eventKey,
            entityType: "user", entityId: user.userId, entityName: name,
            severity: rule.severity,
            title: `Underutilized: ${name}`,
            message: `${name} is predicted at only ${Math.round(avgUtilization)}% avg capacity.`,
          }, inserted.id);
        }
      }
      break;
    }

    case "employee_low_compliance": {
      const sevenDaysAgo = isoDate(addDays(new Date(), -7));
      const complianceRows = await dbRows<{
        user_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string;
        active_tasks: string;
        hours_logged: string;
      }>(sql`
        SELECT
          u.id AS user_id,
          u.first_name,
          u.last_name,
          u.email,
          COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) AS active_tasks,
          COALESCE(SUM(te.duration_seconds) / 3600.0, 0) AS hours_logged
        FROM users u
        LEFT JOIN task_assignees ta ON ta.user_id = u.id AND ta.tenant_id = ${rule.tenantId}
        LEFT JOIN tasks t ON t.id = ta.task_id AND t.tenant_id = ${rule.tenantId}
        LEFT JOIN time_entries te
          ON te.user_id = u.id
          AND te.tenant_id = ${rule.tenantId}
          AND te.start_time >= ${sevenDaysAgo}
        WHERE u.tenant_id = ${rule.tenantId}
          AND u.role IN ('admin', 'employee')
        GROUP BY u.id, u.first_name, u.last_name, u.email
        HAVING COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) >= 3
          AND COALESCE(SUM(te.duration_seconds) / 3600.0, 0) < 1
      `);
      for (const row of complianceRows) {
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email;
        const eventKey = `${rule.id}:${row.user_id}:${weekStart}`;
        const inserted = await insertAlertEvent({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          eventKey,
          entityType: "user",
          entityId: row.user_id,
          entityName: name,
          severity: rule.severity,
          title: `Low Time Compliance: ${name}`,
          message: `${name} has ${row.active_tasks} active tasks but logged <1h in the past 7 days.`,
          payloadJson: { userId: row.user_id, activeTasks: row.active_tasks, hoursLogged: row.hours_logged },
        });
        if (inserted.isNew) {
          await deliverAlertNotifications(rule, {
            tenantId: rule.tenantId, ruleId: rule.id, eventKey,
            entityType: "user", entityId: row.user_id, entityName: name,
            severity: rule.severity,
            title: `Low Time Compliance: ${name}`,
            message: `${name} has ${row.active_tasks} active tasks but logged <1h in the past 7 days.`,
          }, inserted.id);
        }
      }
      break;
    }

    case "project_deadline_high_risk": {
      const result = await computeProjectDeadlineRisk(rule.tenantId, horizonWks);
      for (const proj of result.projects) {
        if (proj.deadlineRisk !== "High") continue;
        const eventKey = `${rule.id}:${proj.projectId}:${weekStart}`;
        const inserted = await insertAlertEvent({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          eventKey,
          entityType: "project",
          entityId: proj.projectId,
          entityName: proj.projectName,
          severity: rule.severity,
          title: `High Deadline Risk: ${proj.projectName}`,
          message: `Project "${proj.projectName}" has ${proj.openTaskCount} open tasks (${proj.overdueCount} overdue). Predicted ${proj.predictedWeeksToClear}w to clear vs ${proj.weeksUntilDue ?? "no"}w until due.`,
          payloadJson: proj,
        });
        if (inserted.isNew) {
          await deliverAlertNotifications(rule, {
            tenantId: rule.tenantId, ruleId: rule.id, eventKey,
            entityType: "project", entityId: proj.projectId, entityName: proj.projectName,
            severity: rule.severity,
            title: `High Deadline Risk: ${proj.projectName}`,
            message: `Project "${proj.projectName}" has ${proj.openTaskCount} open tasks (${proj.overdueCount} overdue).`,
          }, inserted.id);
        }
      }
      break;
    }

    case "client_health_critical": {
      const result = await computeClientRiskTrend(rule.tenantId, horizonWks);
      for (const client of result.clients) {
        if (client.clientRisk !== "High") continue;
        const eventKey = `${rule.id}:${client.clientId}:${weekStart}`;
        const inserted = await insertAlertEvent({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          eventKey,
          entityType: "client",
          entityId: client.clientId,
          entityName: client.companyName,
          severity: rule.severity,
          title: `Critical Client Health: ${client.companyName}`,
          message: `Client "${client.companyName}" health score is ${client.currentHealthScore}/100 — High risk, trend: ${client.riskTrend}.`,
          payloadJson: { clientId: client.clientId, currentScore: client.currentHealthScore, trend: client.riskTrend },
        });
        if (inserted.isNew) {
          await deliverAlertNotifications(rule, {
            tenantId: rule.tenantId, ruleId: rule.id, eventKey,
            entityType: "client", entityId: client.clientId, entityName: client.companyName,
            severity: rule.severity,
            title: `Critical Client Health: ${client.companyName}`,
            message: `Client "${client.companyName}" health score is ${client.currentHealthScore}/100 — High risk.`,
          }, inserted.id);
        }
      }
      break;
    }

    case "client_risk_worsening": {
      const result = await computeClientRiskTrend(rule.tenantId, horizonWks);
      for (const client of result.clients) {
        if (client.riskTrend !== "Worsening") continue;
        const eventKey = `${rule.id}:${client.clientId}:${weekStart}`;
        const inserted = await insertAlertEvent({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          eventKey,
          entityType: "client",
          entityId: client.clientId,
          entityName: client.companyName,
          severity: rule.severity,
          title: `Client Risk Worsening: ${client.companyName}`,
          message: `Client "${client.companyName}" trend is Worsening — health score ${client.currentHealthScore}/100 → predicted ${client.predictedHealthScore}/100.`,
          payloadJson: { clientId: client.clientId, currentScore: client.currentHealthScore, predictedScore: client.predictedHealthScore },
        });
        if (inserted.isNew) {
          await deliverAlertNotifications(rule, {
            tenantId: rule.tenantId, ruleId: rule.id, eventKey,
            entityType: "client", entityId: client.clientId, entityName: client.companyName,
            severity: rule.severity,
            title: `Client Risk Worsening: ${client.companyName}`,
            message: `Client "${client.companyName}" trend is Worsening — health ${client.currentHealthScore} → ${client.predictedHealthScore}.`,
          }, inserted.id);
        }
      }
      break;
    }

    default:
      console.warn({ ruleType: rule.ruleType }, "Unknown alert rule type — skipping");
  }
}

export async function evaluateAlertRules(params: { tenantId: string; now?: Date }): Promise<void> {
  const now = params.now ?? new Date();
  const rules = await dbRows<AlertRuleRow>(sql`
    SELECT * FROM alert_rules
    WHERE tenant_id = ${params.tenantId} AND is_enabled = true
  `);

  for (const rule of rules) {
    try {
      if (rule.lastRunAt) {
        const lastRun = new Date(rule.lastRunAt).getTime();
        const throttleMs = (rule.throttleMinutes ?? 1440) * 60 * 1000;
        if (now.getTime() - lastRun < throttleMs) {
          continue;
        }
      }

      await evaluateRule(rule, now);

      await db.execute(sql`
        UPDATE alert_rules SET last_run_at = ${now.toISOString()} WHERE id = ${rule.id}
      `);
    } catch (err) {
      console.error({ err, ruleId: rule.id, ruleType: rule.ruleType }, "Error evaluating alert rule");
    }
  }
}

export async function runAlertEvaluationForAllTenants(): Promise<void> {
  const tenants = await dbRows<{ tenant_id: string }>(sql`
    SELECT DISTINCT tenant_id FROM alert_rules WHERE is_enabled = true
  `);
  for (const row of tenants) {
    try {
      await evaluateAlertRules({ tenantId: row.tenant_id });
    } catch (err) {
      console.error({ err, tenantId: row.tenant_id }, "Alert evaluation failed for tenant");
    }
  }
}
