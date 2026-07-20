import { db } from "../../../db";
import { tenantAuditEvents } from "@shared/schema";

export async function recordTenantAuditEvent(
  tenantId: string | null,
  eventType: string,
  message: string,
  actorUserId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    if (!tenantId) {
      console.info(`[Audit] ${eventType}: ${message}`);
      return;
    }

    await db.insert(tenantAuditEvents).values({
      tenantId,
      actorUserId: actorUserId || null,
      eventType,
      message,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error(`[Audit] Failed to record event ${eventType} for tenant ${tenantId}:`, error);
  }
}
