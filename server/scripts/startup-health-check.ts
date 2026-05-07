/**
 * Startup Health Check Script
 * 
 * Pre-startup diagnostics to identify issues before the application fully boots.
 * Checks database connectivity, required tables, columns, and migration status.
 * 
 * Usage:
 *   npx tsx server/scripts/startup-health-check.ts
 *   npx tsx server/scripts/startup-health-check.ts --json
 * 
 * Output:
 *   { healthy: boolean, issues: string[], recommendations: string[] }
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { getTrackedMigrationEntries } from "../lib/migrationJournal";
import { REQUIRED_COLUMNS, REQUIRED_TABLES } from "../startup/schemaReadiness";

interface HealthCheckResult {
  healthy: boolean;
  timestamp: string;
  database: {
    connected: boolean;
    latencyMs: number | null;
    error: string | null;
  };
  migrations: {
    tableExists: boolean;
    appliedCount: number;
    lastApplied: string | null;
    lastAppliedAt: number | null;
    pendingCount: number;
    pendingFiles: string[];
  };
  tables: {
    allPresent: boolean;
    present: string[];
    missing: string[];
  };
  columns: {
    allPresent: boolean;
    present: string[];
    missing: string[];
  };
  issues: string[];
  recommendations: string[];
}

async function checkDatabaseConnection(): Promise<{ connected: boolean; latencyMs: number | null; error: string | null }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { connected: true, latencyMs: Date.now() - start, error: null };
  } catch (e: any) {
    return { connected: false, latencyMs: null, error: e?.message || String(e) };
  }
}

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      ) as exists
    `);
    return (result.rows[0] as any)?.exists === true;
  } catch {
    return false;
  }
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      ) as exists
    `);
    return (result.rows[0] as any)?.exists === true;
  } catch {
    return false;
  }
}

async function getMigrationStatus(): Promise<{
  tableExists: boolean;
  appliedCount: number;
  lastApplied: string | null;
  lastAppliedAt: number | null;
}> {
  try {
    const result = await db.execute(sql`
      SELECT hash, created_at
      FROM drizzle.__drizzle_migrations 
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int as total FROM drizzle.__drizzle_migrations
    `);
    
    const count = (countResult.rows[0] as any)?.total || 0;
    const last = result.rows[0] as any;
    
    return {
      tableExists: true,
      appliedCount: count,
      lastApplied: last?.hash || null,
      lastAppliedAt: last?.created_at ? Number(last.created_at) : null,
    };
  } catch (e: any) {
    // Table doesn't exist yet
    if (e?.message?.includes("does not exist") || e?.message?.includes("relation")) {
      return {
        tableExists: false,
        appliedCount: 0,
        lastApplied: null,
        lastAppliedAt: null,
      };
    }
    throw e;
  }
}

function getPendingMigrations(lastAppliedAt: number | null): { count: number; files: string[] } {
  const entries = getTrackedMigrationEntries();
  const pending = lastAppliedAt
    ? entries.filter((entry) => entry.when > lastAppliedAt)
    : entries;

  return { count: pending.length, files: pending.map((entry) => entry.tag) };
}

async function runHealthCheck(): Promise<HealthCheckResult> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check database connection
  console.log("[health-check] Checking database connection...");
  const dbStatus = await checkDatabaseConnection();
  
  if (!dbStatus.connected) {
    issues.push(`Database connection failed: ${dbStatus.error}`);
    recommendations.push("Check DATABASE_URL environment variable");
    recommendations.push("Verify database server is running and accessible");
    
    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      database: dbStatus,
      migrations: {
        tableExists: false,
        appliedCount: 0,
        lastApplied: null,
        lastAppliedAt: null,
        pendingCount: 0,
        pendingFiles: [],
      },
      tables: { allPresent: false, present: [], missing: REQUIRED_TABLES },
      columns: { allPresent: false, present: [], missing: REQUIRED_COLUMNS.map(c => `${c.table}.${c.column}`) },
      issues,
      recommendations,
    };
  }
  
  console.log(`[health-check] Database connected (${dbStatus.latencyMs}ms)`);
  
  // Check migration status
  console.log("[health-check] Checking migration status...");
  const migrationStatus = await getMigrationStatus();
  
  if (!migrationStatus.tableExists) {
    issues.push("Migrations table does not exist - database needs initial migration");
    recommendations.push("Set AUTO_MIGRATE=true environment variable");
    recommendations.push("Or run: npx tsx server/scripts/migrate.ts");
  }
  
  const pendingMigrations = getPendingMigrations(migrationStatus.lastAppliedAt);
  
  if (pendingMigrations.count > 0) {
    issues.push(`${pendingMigrations.count} pending migration(s): ${pendingMigrations.files.join(", ")}`);
    recommendations.push("Set AUTO_MIGRATE=true to run migrations on startup");
  }
  
  console.log(`[health-check] Migrations: ${migrationStatus.appliedCount} applied, ${pendingMigrations.count} pending`);
  
  // Check required tables
  console.log("[health-check] Checking required tables...");
  const presentTables: string[] = [];
  const missingTables: string[] = [];
  
  for (const table of REQUIRED_TABLES) {
    const exists = await checkTableExists(table);
    if (exists) {
      presentTables.push(table);
    } else {
      missingTables.push(table);
    }
  }
  
  if (missingTables.length > 0) {
    issues.push(`Missing tables: ${missingTables.join(", ")}`);
    recommendations.push("Run migrations to create missing tables");
  }
  
  console.log(`[health-check] Tables: ${presentTables.length}/${REQUIRED_TABLES.length} present`);
  
  // Check required columns
  console.log("[health-check] Checking required columns...");
  const presentColumns: string[] = [];
  const missingColumns: string[] = [];
  
  for (const { table, column } of REQUIRED_COLUMNS) {
    const exists = await checkColumnExists(table, column);
    const key = `${table}.${column}`;
    if (exists) {
      presentColumns.push(key);
    } else {
      // Only report missing if the table exists (otherwise it's a table issue)
      if (presentTables.includes(table)) {
        missingColumns.push(key);
      }
    }
  }
  
  if (missingColumns.length > 0) {
    issues.push(`Missing columns: ${missingColumns.join(", ")}`);
    recommendations.push("Run migrations to add missing columns");
  }
  
  console.log(`[health-check] Columns: ${presentColumns.length}/${REQUIRED_COLUMNS.length} present`);
  
  // Determine overall health
  const healthy = issues.length === 0;
  
  return {
    healthy,
    timestamp: new Date().toISOString(),
    database: dbStatus,
    migrations: {
      tableExists: migrationStatus.tableExists,
      appliedCount: migrationStatus.appliedCount,
      lastApplied: migrationStatus.lastApplied,
      lastAppliedAt: migrationStatus.lastAppliedAt,
      pendingCount: pendingMigrations.count,
      pendingFiles: pendingMigrations.files,
    },
    tables: {
      allPresent: missingTables.length === 0,
      present: presentTables,
      missing: missingTables,
    },
    columns: {
      allPresent: missingColumns.length === 0,
      present: presentColumns,
      missing: missingColumns,
    },
    issues,
    recommendations,
  };
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  
  console.log("[health-check] Starting startup health check...\n");
  
  try {
    const result = await runHealthCheck();
    
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\n========================================");
      console.log(`HEALTH STATUS: ${result.healthy ? "✓ HEALTHY" : "✗ UNHEALTHY"}`);
      console.log("========================================\n");
      
      console.log("Database:");
      console.log(`  Connected: ${result.database.connected ? "Yes" : "No"}`);
      if (result.database.connected) {
        console.log(`  Latency: ${result.database.latencyMs}ms`);
      }
      if (result.database.error) {
        console.log(`  Error: ${result.database.error}`);
      }
      
      console.log("\nMigrations:");
      console.log(`  Table exists: ${result.migrations.tableExists ? "Yes" : "No"}`);
      console.log(`  Applied: ${result.migrations.appliedCount}`);
      console.log(`  Pending: ${result.migrations.pendingCount}`);
      if (result.migrations.lastApplied) {
        console.log(`  Last applied: ${result.migrations.lastApplied}`);
      }
      
      console.log("\nTables:");
      console.log(`  Present: ${result.tables.present.length}/${result.tables.present.length + result.tables.missing.length}`);
      if (result.tables.missing.length > 0) {
        console.log(`  Missing: ${result.tables.missing.join(", ")}`);
      }
      
      console.log("\nColumns:");
      console.log(`  Present: ${result.columns.present.length}/${result.columns.present.length + result.columns.missing.length}`);
      if (result.columns.missing.length > 0) {
        console.log(`  Missing: ${result.columns.missing.join(", ")}`);
      }
      
      if (result.issues.length > 0) {
        console.log("\nIssues:");
        result.issues.forEach(issue => console.log(`  - ${issue}`));
      }
      
      if (result.recommendations.length > 0) {
        console.log("\nRecommendations:");
        result.recommendations.forEach(rec => console.log(`  → ${rec}`));
      }
      
      console.log("");
    }
    
    process.exit(result.healthy ? 0 : 1);
  } catch (error: any) {
    console.error("[health-check] Fatal error:", error?.message || error);
    process.exit(1);
  }
}

// Export for programmatic use
export { runHealthCheck };
export type { HealthCheckResult };

// Run if executed directly
main();
