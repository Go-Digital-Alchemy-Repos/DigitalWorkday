import { db } from "../../../db";
import { tenants, tenantAuditEvents } from "@shared/schema";
import { eq } from "drizzle-orm";

export const QUARANTINE_TENANT_SLUG = "quarantine";

export async function getQuarantineTenantId(): Promise<string | null> {
  const [qt] = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
    .limit(1);
  return qt?.id || null;
}

export async function writeAuditEvent(
  tenantId: string,
  userId: string | null,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(tenantAuditEvents).values({
    tenantId,
    actorUserId: userId,
    eventType,
    message,
    metadata,
  });
}
