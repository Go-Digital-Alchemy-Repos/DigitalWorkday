/**
 * Migration Status Logger
 * 
 * Logs the last applied migration at server startup.
 * This provides visibility into which schema version is running.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface MigrationRecord {
  id: number;
  hash: string;
  created_at: string;
}

export async function logMigrationStatus(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT id, hash, created_at 
      FROM drizzle.__drizzle_migrations 
      ORDER BY id DESC 
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      const latest = result.rows[0] as unknown as MigrationRecord;
      console.log(`[migrations] Last applied: ${latest.hash} (id: ${latest.id})`);
      
      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int as total FROM drizzle.__drizzle_migrations
      `);
      const total = (countResult.rows[0] as any)?.total || 0;
      console.log(`[migrations] Total migrations applied: ${total}`);
    } else {
      console.log("[migrations] No migrations found in tracking table");
    }
  } catch (error: any) {
    if (error?.code === "42P01") {
      console.log("[migrations] Migrations table not found - database may need initial setup");
    } else {
      console.warn("[migrations] Could not check migration status:", error?.message || error);
    }
  }
}
