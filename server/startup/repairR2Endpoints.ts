/**
 * Startup repair: trim whitespace from stored R2 endpoint URLs in tenant_integrations.
 *
 * A corrupted record with a space in the account ID was causing
 * "TypeError: Invalid URL" on every upload/presign attempt for affected tenants.
 * This runs once at boot and is a no-op when all records are already clean.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function repairR2Endpoints(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE tenant_integrations
      SET config_public = jsonb_set(
        config_public,
        '{endpoint}',
        to_jsonb(trim(config_public->>'endpoint'))
      )
      WHERE provider = 'r2'
        AND config_public ? 'endpoint'
        AND config_public->>'endpoint' != trim(config_public->>'endpoint')
    `);

    const count = (result as any).rowCount ?? 0;
    if (count > 0) {
      console.log(`[repairR2Endpoints] Fixed ${count} R2 integration record(s) with whitespace in endpoint URL.`);
    }
  } catch (err) {
    console.error("[repairR2Endpoints] Failed to repair R2 endpoints:", err);
  }
}
