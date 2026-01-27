/**
 * Database Smoke Test Script
 * 
 * Verifies that all required tables and columns exist in the database.
 * Run with: npx tsx server/scripts/db-smoke.ts
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface TableCheck {
  table: string;
  columns: string[];
}

const REQUIRED_SCHEMA: TableCheck[] = [
  {
    table: "error_logs",
    columns: ["id", "request_id", "tenant_id", "user_id", "method", "path", "status", "message", "stack", "created_at"]
  },
  {
    table: "notification_preferences",
    columns: ["id", "tenant_id", "user_id", "task_deadline", "task_assigned", "email_enabled", "created_at"]
  },
  {
    table: "chat_channels",
    columns: ["id", "tenant_id", "name", "is_private", "created_by", "created_at"]
  },
  {
    table: "chat_dm_members",
    columns: ["id", "tenant_id", "dm_thread_id", "user_id", "created_at"]
  },
  {
    table: "chat_dm_threads",
    columns: ["id", "tenant_id", "created_at"]
  },
  {
    table: "chat_messages",
    columns: ["id", "tenant_id", "body", "author_user_id", "created_at"]
  },
  {
    table: "active_timers",
    columns: ["id", "user_id", "workspace_id", "title", "status", "elapsed_seconds", "created_at"]
  },
  {
    table: "tenants",
    columns: ["id", "name", "slug", "status", "chat_retention_days", "created_at"]
  },
  {
    table: "tenant_settings",
    columns: ["id", "tenant_id", "created_at"]
  }
];

async function checkTableExists(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
    ) as exists
  `);
  return (result.rows[0] as any)?.exists === true;
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    ) as exists
  `);
  return (result.rows[0] as any)?.exists === true;
}

async function runSmokeTest(): Promise<void> {
  console.log("=".repeat(60));
  console.log("DATABASE SMOKE TEST");
  console.log("=".repeat(60));
  console.log("");

  let allPassed = true;
  const errors: string[] = [];

  for (const check of REQUIRED_SCHEMA) {
    const tableExists = await checkTableExists(check.table);
    
    if (!tableExists) {
      console.log(`❌ Table '${check.table}' does not exist`);
      errors.push(`Table '${check.table}' missing`);
      allPassed = false;
      continue;
    }
    
    console.log(`✅ Table '${check.table}' exists`);
    
    for (const column of check.columns) {
      const columnExists = await checkColumnExists(check.table, column);
      
      if (!columnExists) {
        console.log(`   ❌ Column '${column}' missing`);
        errors.push(`Column '${check.table}.${column}' missing`);
        allPassed = false;
      } else {
        console.log(`   ✅ Column '${column}'`);
      }
    }
    console.log("");
  }

  console.log("=".repeat(60));
  
  if (allPassed) {
    console.log("RESULT: ✅ PASS - All required tables and columns exist");
    console.log("=".repeat(60));
    process.exit(0);
  } else {
    console.log("RESULT: ❌ FAIL - Missing tables/columns detected");
    console.log("");
    console.log("Missing items:");
    errors.forEach(e => console.log(`  - ${e}`));
    console.log("");
    console.log("Run migrations to fix: npx drizzle-kit migrate");
    console.log("=".repeat(60));
    process.exit(1);
  }
}

runSmokeTest().catch(err => {
  console.error("Smoke test failed with error:", err);
  process.exit(1);
});
