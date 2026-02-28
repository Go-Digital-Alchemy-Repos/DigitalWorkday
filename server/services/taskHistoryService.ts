import { db } from "../db";
import { taskHistory } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export interface HistoryChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface RecordHistoryParams {
  tenantId: string;
  entityType: "task" | "subtask";
  entityId: string;
  actorUserId: string | null;
  actionType: string;
  changes?: HistoryChange[];
}

export async function recordHistory(params: RecordHistoryParams) {
  const { tenantId, entityType, entityId, actorUserId, actionType, changes } = params;
  if (!tenantId || !entityId) return;

  try {
    await db.insert(taskHistory).values({
      tenantId,
      entityType,
      entityId,
      actorUserId,
      actionType,
      changes: changes && changes.length > 0 ? changes : null,
    });
  } catch (err) {
    console.error("[taskHistory] Failed to record history:", err);
  }
}

export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): HistoryChange[] {
  const changes: HistoryChange[] = [];
  for (const field of fields) {
    const fromVal = before[field] ?? null;
    const toVal = after[field] ?? null;
    const fromStr = JSON.stringify(fromVal);
    const toStr = JSON.stringify(toVal);
    if (fromStr !== toStr) {
      changes.push({ field, from: fromVal, to: toVal });
    }
  }
  return changes;
}

export async function getHistory(
  tenantId: string,
  entityType: "task" | "subtask",
  entityId: string,
  limit = 50,
  offset = 0
) {
  const rows = await db
    .select()
    .from(taskHistory)
    .where(
      and(
        eq(taskHistory.tenantId, tenantId),
        eq(taskHistory.entityType, entityType),
        eq(taskHistory.entityId, entityId)
      )
    )
    .orderBy(desc(taskHistory.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function getHistoryWithActors(
  tenantId: string,
  entityType: "task" | "subtask",
  entityId: string,
  limit = 50,
  offset = 0
) {
  const rows = await db.execute(sql`
    SELECT 
      th.id, th.tenant_id as "tenantId", th.entity_type as "entityType",
      th.entity_id as "entityId", th.actor_user_id as "actorUserId",
      th.action_type as "actionType", th.changes, th.created_at as "createdAt",
      u.first_name as "actorFirstName", u.last_name as "actorLastName",
      u.email as "actorEmail", u.avatar_url as "actorAvatarUrl",
      u.name as "actorName"
    FROM task_history th
    LEFT JOIN users u ON th.actor_user_id = u.id
    WHERE th.tenant_id = ${tenantId}
      AND th.entity_type = ${entityType}
      AND th.entity_id = ${entityId}
    ORDER BY th.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows.rows;
}
