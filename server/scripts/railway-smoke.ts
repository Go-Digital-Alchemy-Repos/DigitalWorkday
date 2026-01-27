/**
 * Railway Smoke Test Script
 * 
 * Comprehensive verification that the Railway deployment is healthy.
 * Run with: npx tsx server/scripts/railway-smoke.ts
 * 
 * Checks (DB/Service Layer):
 * 1. Database connectivity
 * 2. Migrations applied (including critical 0004)
 * 3. Required tables/columns exist
 * 4. Core service dependencies are queryable
 * 
 * This script validates the DB/service layer. For HTTP endpoint testing,
 * use manual verification after deployment:
 * - curl /api/health (no auth)
 * - Browser: /api/timer/current (authenticated)
 * - Browser: /api/v1/super/status/db (super admin)
 * 
 * See docs/RAILWAY_DEPLOYMENT_CHECKLIST.md for full verification steps.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  critical: boolean;
}

const results: CheckResult[] = [];

function logCheck(name: string, passed: boolean, message: string, critical = true): void {
  results.push({ name, passed, message, critical });
  const icon = passed ? "✅" : (critical ? "❌" : "⚠️");
  console.log(`${icon} ${name}: ${message}`);
}

async function checkDatabaseConnectivity(): Promise<void> {
  try {
    const result = await db.execute(sql`SELECT 1 as test`);
    if ((result.rows[0] as any)?.test === 1) {
      logCheck("Database Connectivity", true, "Connected successfully");
    } else {
      logCheck("Database Connectivity", false, "Unexpected query result", true);
    }
  } catch (error: any) {
    logCheck("Database Connectivity", false, `Connection failed: ${error.message}`, true);
  }
}

async function checkMigrationsApplied(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count, MAX(hash) as latest 
      FROM drizzle.__drizzle_migrations
    `);
    const row = result.rows[0] as any;
    const count = parseInt(row?.count || "0");
    const latest = row?.latest || "none";
    
    // Check if critical production migration is applied (0004_add_missing_production_tables)
    const criticalMigrationResult = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations 
        WHERE hash LIKE '%add_missing_production%' OR hash LIKE '%0004%'
      ) as exists
    `);
    const hasCriticalMigration = (criticalMigrationResult.rows[0] as any)?.exists === true;
    
    if (count > 0 && hasCriticalMigration) {
      logCheck("Migrations Applied", true, `${count} migrations (latest: ${latest})`);
    } else if (count > 0) {
      logCheck("Migrations Applied", false, `${count} migrations applied but missing critical 0004 migration. Run: npx drizzle-kit migrate`, true);
    } else {
      logCheck("Migrations Applied", false, `No migrations applied. Run: npx drizzle-kit migrate`, true);
    }
  } catch (error: any) {
    logCheck("Migrations Applied", false, `Cannot read migrations: ${error.message}`, true);
  }
}

async function checkRequiredTables(): Promise<void> {
  const requiredTables = [
    "users",
    "tenants",
    "workspaces",
    "projects",
    "tasks",
    "active_timers",
    "error_logs",
    "notification_preferences",
    "chat_channels",
    "chat_dm_members"
  ];
  
  try {
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const existingTables = new Set(result.rows.map((r: any) => r.table_name));
    
    const missingTables = requiredTables.filter(t => !existingTables.has(t));
    
    if (missingTables.length === 0) {
      logCheck("Required Tables", true, `All ${requiredTables.length} required tables exist`);
    } else {
      logCheck("Required Tables", false, `Missing tables: ${missingTables.join(", ")}`, true);
    }
  } catch (error: any) {
    logCheck("Required Tables", false, `Cannot check tables: ${error.message}`, true);
  }
}

async function checkRequiredColumns(): Promise<void> {
  const columnChecks = [
    { table: "active_timers", column: "title" },
    { table: "tenants", column: "chat_retention_days" },
    { table: "error_logs", column: "request_id" }
  ];
  
  const missing: string[] = [];
  
  for (const check of columnChecks) {
    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = ${check.table}
          AND column_name = ${check.column}
        ) as exists
      `);
      
      if (!(result.rows[0] as any)?.exists) {
        missing.push(`${check.table}.${check.column}`);
      }
    } catch (error) {
      missing.push(`${check.table}.${check.column} (error)`);
    }
  }
  
  if (missing.length === 0) {
    logCheck("Required Columns", true, `All ${columnChecks.length} critical columns exist`);
  } else {
    logCheck("Required Columns", false, `Missing columns: ${missing.join(", ")}`, true);
  }
}

async function checkEnvironmentVariables(): Promise<void> {
  const required = ["DATABASE_URL"];
  const recommended = ["SESSION_SECRET", "NODE_ENV"];
  
  const missingRequired = required.filter(v => !process.env[v]);
  const missingRecommended = recommended.filter(v => !process.env[v]);
  
  if (missingRequired.length > 0) {
    logCheck("Required Env Vars", false, `Missing: ${missingRequired.join(", ")}`, true);
  } else {
    logCheck("Required Env Vars", true, "All required env vars set");
  }
  
  if (missingRecommended.length > 0) {
    logCheck("Recommended Env Vars", false, `Missing: ${missingRecommended.join(", ")}`, false);
  } else {
    logCheck("Recommended Env Vars", true, "All recommended env vars set");
  }
}

async function checkSuperAdminExists(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'
    `);
    const count = parseInt((result.rows[0] as any)?.count || "0");
    
    if (count > 0) {
      logCheck("Super Admin Exists", true, `${count} super admin(s) found`);
    } else {
      logCheck("Super Admin Exists", false, "No super admin. First user to register becomes Super Admin", false);
    }
  } catch (error: any) {
    logCheck("Super Admin Exists", false, `Cannot check: ${error.message}`, false);
  }
}

async function checkTenantExists(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM tenants WHERE status = 'active'
    `);
    const count = parseInt((result.rows[0] as any)?.count || "0");
    
    if (count > 0) {
      logCheck("Active Tenants", true, `${count} active tenant(s)`);
    } else {
      logCheck("Active Tenants", false, "No active tenants. Bootstrap required", false);
    }
  } catch (error: any) {
    logCheck("Active Tenants", false, `Cannot check: ${error.message}`, false);
  }
}

async function checkCoreServicesDirectly(): Promise<void> {
  // Direct service-level checks (no HTTP needed)
  
  // Check 1: Error logs table is queryable (tests error logging service)
  try {
    await db.execute(sql`SELECT 1 FROM error_logs LIMIT 1`);
    logCheck("Error Logging Service", true, "error_logs table accessible");
  } catch (error: any) {
    logCheck("Error Logging Service", false, `Cannot query error_logs: ${error.message}`, true);
  }
  
  // Check 2: Active timers table with title column (tests timer/current endpoint dependency)
  try {
    await db.execute(sql`SELECT id, title, status FROM active_timers LIMIT 1`);
    logCheck("Timer Service (title column)", true, "active_timers.title accessible");
  } catch (error: any) {
    logCheck("Timer Service (title column)", false, `Cannot query active_timers.title: ${error.message}`, true);
  }
  
  // Check 3: Chat retention days in tenants (tests chat settings)
  try {
    await db.execute(sql`SELECT chat_retention_days FROM tenants LIMIT 1`);
    logCheck("Chat Settings", true, "tenants.chat_retention_days accessible");
  } catch (error: any) {
    logCheck("Chat Settings", false, `Cannot query tenants.chat_retention_days: ${error.message}`, true);
  }
  
  // Check 4: Notification preferences (tests notification service)
  try {
    await db.execute(sql`SELECT user_id, task_deadline FROM notification_preferences LIMIT 1`);
    logCheck("Notification Service", true, "notification_preferences accessible");
  } catch (error: any) {
    logCheck("Notification Service", false, `Cannot query notification_preferences: ${error.message}`, true);
  }
  
  // Check 5: Chat channels and DM members (tests chat service)
  try {
    await db.execute(sql`SELECT id FROM chat_channels LIMIT 1`);
    await db.execute(sql`SELECT id FROM chat_dm_members LIMIT 1`);
    logCheck("Chat Service", true, "chat_channels and chat_dm_members accessible");
  } catch (error: any) {
    logCheck("Chat Service", false, `Cannot query chat tables: ${error.message}`, true);
  }
}

async function checkAppVersion(): Promise<void> {
  const gitSha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || "unknown";
  const nodeEnv = process.env.NODE_ENV || "development";
  const autoMigrate = process.env.AUTO_MIGRATE || "false";
  
  console.log("");
  console.log("App Configuration:");
  console.log(`  Git SHA: ${gitSha.substring(0, 7)}`);
  console.log(`  NODE_ENV: ${nodeEnv}`);
  console.log(`  AUTO_MIGRATE: ${autoMigrate}`);
  console.log("");
}

async function runSmokeTest(): Promise<void> {
  console.log("=".repeat(60));
  console.log("RAILWAY SMOKE TEST");
  console.log("=".repeat(60));
  console.log("");
  
  await checkAppVersion();
  
  console.log("Running checks...");
  console.log("");
  
  await checkEnvironmentVariables();
  await checkDatabaseConnectivity();
  await checkMigrationsApplied();
  await checkRequiredTables();
  await checkRequiredColumns();
  await checkCoreServicesDirectly();
  await checkSuperAdminExists();
  await checkTenantExists();
  
  console.log("");
  console.log("=".repeat(60));
  
  const criticalFailures = results.filter(r => !r.passed && r.critical);
  const warnings = results.filter(r => !r.passed && !r.critical);
  const passed = results.filter(r => r.passed);
  
  console.log(`Results: ${passed.length} passed, ${warnings.length} warnings, ${criticalFailures.length} critical failures`);
  
  if (criticalFailures.length > 0) {
    console.log("");
    console.log("RESULT: ❌ FAIL - Critical issues detected");
    console.log("");
    console.log("Critical failures:");
    criticalFailures.forEach(f => console.log(`  - ${f.name}: ${f.message}`));
    console.log("");
    console.log("Run migrations: npx drizzle-kit migrate");
    console.log("Or apply: psql $DATABASE_URL -f migrations/0004_add_missing_production_tables.sql");
    console.log("=".repeat(60));
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log("");
    console.log("RESULT: ⚠️ PASS WITH WARNINGS");
    console.log("");
    console.log("Warnings:");
    warnings.forEach(w => console.log(`  - ${w.name}: ${w.message}`));
    console.log("=".repeat(60));
    process.exit(0);
  } else {
    console.log("");
    console.log("RESULT: ✅ PASS - All checks passed");
    console.log("=".repeat(60));
    process.exit(0);
  }
}

runSmokeTest().catch(err => {
  console.error("Smoke test failed with error:", err);
  process.exit(1);
});
