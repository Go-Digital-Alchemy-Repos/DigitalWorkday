/**
 * Mark existing migrations as applied in the database.
 * 
 * Use this when:
 * - Tables were created via `drizzle-kit push` but migrations weren't tracked
 * - Production shows "relation already exists" errors during AUTO_MIGRATE
 * 
 * Usage:
 *   npx tsx server/scripts/markMigrationsApplied.ts
 *   npx tsx server/scripts/markMigrationsApplied.ts --dry-run
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const isDryRun = process.argv.includes('--dry-run');

async function markMigrationsApplied() {
  console.log('[markMigrations] Starting...');
  console.log('[markMigrations] Mode:', isDryRun ? 'DRY RUN' : 'LIVE');
  
  try {
    // Read the migration journal
    const journalPath = path.join(process.cwd(), 'migrations', 'meta', '_journal.json');
    if (!fs.existsSync(journalPath)) {
      console.error('[markMigrations] No migration journal found at:', journalPath);
      process.exit(1);
    }
    
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const entries = journal.entries || [];
    
    console.log(`[markMigrations] Found ${entries.length} migrations in journal`);
    
    // Create __drizzle_migrations table if it doesn't exist
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
    `;
    
    if (isDryRun) {
      console.log('[markMigrations] Would create __drizzle_migrations table if not exists');
    } else {
      await db.execute(sql.raw(createTableSQL));
      console.log('[markMigrations] Ensured __drizzle_migrations table exists');
    }
    
    // Check which migrations are already recorded
    let existingHashes: Set<string> = new Set();
    try {
      const existing = await db.execute(sql`SELECT hash FROM "__drizzle_migrations"`);
      existingHashes = new Set((existing.rows as any[]).map(r => r.hash));
      console.log(`[markMigrations] Found ${existingHashes.size} already applied migrations`);
    } catch (e) {
      console.log('[markMigrations] No existing migrations found (table may be empty)');
    }
    
    // Insert migration records for each entry
    let inserted = 0;
    let skipped = 0;
    
    for (const entry of entries) {
      const hash = entry.tag;
      const createdAt = entry.when;
      
      if (existingHashes.has(hash)) {
        console.log(`[markMigrations] SKIP: ${hash} (already recorded)`);
        skipped++;
        continue;
      }
      
      if (isDryRun) {
        console.log(`[markMigrations] Would INSERT: ${hash} (created_at: ${createdAt})`);
      } else {
        await db.execute(sql`
          INSERT INTO "__drizzle_migrations" (hash, created_at)
          VALUES (${hash}, ${createdAt})
        `);
        console.log(`[markMigrations] INSERTED: ${hash}`);
      }
      inserted++;
    }
    
    console.log('[markMigrations] Complete!');
    console.log(`[markMigrations] Inserted: ${inserted}, Skipped: ${skipped}`);
    
    if (isDryRun) {
      console.log('[markMigrations] This was a dry run. Run without --dry-run to apply.');
    }
    
  } catch (error) {
    console.error('[markMigrations] Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

markMigrationsApplied();
