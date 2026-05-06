/**
 * Schema Readiness Check
 *
 * Ensures database schema is ready before the app starts serving traffic.
 * - Runs Drizzle migrations if AUTO_MIGRATE=true
 * - Validates required tables/columns exist
 * - Fails fast with clear error if critical issues found
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { getTrackedMigrationEntries } from "../lib/migrationJournal";

export interface SchemaColumnCheck {
  table: string;
  column: string;
}

const CRITICAL_TABLES = [
  "users",
  "tenants",
  "user_sessions",
  "workspaces",
  "projects",
  "tasks",
  "clients",
  "teams",
];

const IMPORTANT_TABLES = [
  "error_logs",
  "notifications",
  "notification_preferences",
  "email_outbox",
  "sections",
  "project_members",
  "task_assignees",
  "subtasks",
  "subtask_assignees",
  "task_attachments",
  "time_entries",
  "active_timers",
  "chat_channels",
  "chat_dm_members",
  "chat_messages",
  "chat_dm_threads",
  "chat_channel_members",
  "chat_reads",
  "chat_thread_reads",
  "chat_mentions",
  "chat_message_reactions",
  "chat_attachments",
];

const OPTIONAL_TABLES = [
  "client_notes",
  "client_documents",
];

const REQUIRED_TABLES = [
  ...CRITICAL_TABLES,
  ...IMPORTANT_TABLES,
  ...OPTIONAL_TABLES,
];

const CRITICAL_COLUMNS: SchemaColumnCheck[] = [
  { table: "users", column: "tenant_id" },
  { table: "projects", column: "tenant_id" },
  { table: "projects", column: "client_id" },
  { table: "tasks", column: "tenant_id" },
  { table: "tasks", column: "project_id" },
  { table: "clients", column: "tenant_id" },
  { table: "notifications", column: "tenant_id" },
  { table: "error_logs", column: "request_id" },
];

const IMPORTANT_COLUMNS: SchemaColumnCheck[] = [
  { table: "tenants", column: "chat_retention_days" },
  { table: "active_timers", column: "title" },
  { table: "active_timers", column: "subtask_id" },
  { table: "sections", column: "archived_at" },
  { table: "sections", column: "archived_by" },
  { table: "task_attachments", column: "subtask_id" },
  { table: "chat_messages", column: "parent_message_id" },
  { table: "chat_messages", column: "edited_at" },
  { table: "chat_messages", column: "deleted_at" },
  { table: "chat_messages", column: "archived_at" },
];

const OPTIONAL_COLUMNS: SchemaColumnCheck[] = [];

const REQUIRED_COLUMNS = [
  ...CRITICAL_COLUMNS,
  ...IMPORTANT_COLUMNS,
  ...OPTIONAL_COLUMNS,
];

export {
  CRITICAL_TABLES,
  IMPORTANT_TABLES,
  OPTIONAL_TABLES,
  CRITICAL_COLUMNS,
  IMPORTANT_COLUMNS,
  OPTIONAL_COLUMNS,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
};

export interface SchemaCheckResult {
  migrationAppliedCount: number;
  pendingMigrationCount: number;
  pendingMigrationTags: string[];
  lastMigrationTimestamp: string | null;
  lastMigrationHash: string | null;
  dbConnectionOk: boolean;
  tablesCheck: { table: string; exists: boolean }[];
  columnsCheck: { table: string; column: string; exists: boolean }[];
  allTablesExist: boolean;
  allColumnsExist: boolean;
  isReady: boolean;
  errors: string[];
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

async function checkColumnExists(
  tableName: string,
  columnName: string,
): Promise<boolean> {
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

async function getMigrationInfo(): Promise<{
  count: number;
  lastHash: string | null;
  lastTimestamp: string | null;
}> {
  try {
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int as total FROM drizzle.__drizzle_migrations
    `);
    const count = (countResult.rows[0] as any)?.total || 0;

    if (count > 0) {
      const lastResult = await db.execute(sql`
        SELECT hash, created_at 
        FROM drizzle.__drizzle_migrations 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      const last = lastResult.rows[0] as any;
      return {
        count,
        lastHash: last?.hash || null,
        lastTimestamp: last?.created_at || null,
      };
    }
    return { count: 0, lastHash: null, lastTimestamp: null };
  } catch (error: any) {
    if (error?.code === "42P01") {
      return { count: 0, lastHash: null, lastTimestamp: null };
    }
    throw error;
  }
}

function getPendingMigrationTags(lastMigrationTimestamp: string | null): string[] {
  const entries = getTrackedMigrationEntries();

  if (!lastMigrationTimestamp) {
    return entries.map((entry) => entry.tag);
  }

  const lastAppliedAt = Number(lastMigrationTimestamp);
  if (!Number.isFinite(lastAppliedAt)) {
    return entries.map((entry) => entry.tag);
  }

  return entries
    .filter((entry) => entry.when > lastAppliedAt)
    .map((entry) => entry.tag);
}

export function schemaRequiredObjectsExist(check: SchemaCheckResult): boolean {
  const tableStatus = check.tablesCheck.reduce(
    (acc, tableCheck) => {
      acc[tableCheck.table] = tableCheck.exists;
      return acc;
    },
    {} as Record<string, boolean>,
  );
  const columnStatus = check.columnsCheck.reduce(
    (acc, columnCheck) => {
      acc[`${columnCheck.table}.${columnCheck.column}`] = columnCheck.exists;
      return acc;
    },
    {} as Record<string, boolean>,
  );

  return (
    CRITICAL_TABLES.every((table) => tableStatus[table]) &&
    IMPORTANT_TABLES.every((table) => tableStatus[table]) &&
    CRITICAL_COLUMNS.every(
      (column) => columnStatus[`${column.table}.${column.column}`],
    ) &&
    IMPORTANT_COLUMNS.every(
      (column) => columnStatus[`${column.table}.${column.column}`],
    )
  );
}

export function schemaNeedsMigration(check: SchemaCheckResult): boolean {
  return check.pendingMigrationCount > 0 || !check.isReady;
}

async function autoBaselineMigrations(): Promise<number> {
  const entries = getTrackedMigrationEntries();

  if (entries.length === 0) {
    return 0;
  }

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const existingResult = await db.execute(sql`
    SELECT created_at FROM drizzle.__drizzle_migrations
  `);
  const existingCreatedAts = new Set(
    (existingResult.rows as Array<{ created_at: string | number | null }>)
      .map((row) => Number(row.created_at))
      .filter((value) => Number.isFinite(value)),
  );

  let baselined = 0;
  for (const entry of entries) {
    if (existingCreatedAts.has(entry.when)) {
      continue;
    }
    await db.execute(sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${entry.tag}, ${entry.when})
    `);
    baselined += 1;
  }

  return baselined;
}

export async function runMigrations(): Promise<{
  success: boolean;
  error?: string;
  durationMs?: number;
  appliedCount?: number;
}> {
  const migrationsPath = path.resolve(process.cwd(), "migrations");
  const startTime = Date.now();
  console.log(
    `[migrations] Migrations started at ${new Date(startTime).toISOString()}`,
  );
  console.log(`[migrations] Migrations folder: ${migrationsPath}`);

  // Get count before migration
  let beforeCount = 0;
  try {
    const beforeInfo = await getMigrationInfo();
    beforeCount = beforeInfo.count;
  } catch {
    /* ignore */
  }

  try {
    await migrate(db, { migrationsFolder: migrationsPath });
    const durationMs = Date.now() - startTime;

    // Get count after migration
    let afterCount = beforeCount;
    try {
      const afterInfo = await getMigrationInfo();
      afterCount = afterInfo.count;
    } catch {
      /* ignore */
    }

    const appliedCount = afterCount - beforeCount;
    console.log(
      `[migrations] Migrations completed in ${durationMs}ms - applied ${appliedCount} new migrations`,
    );
    return { success: true, durationMs, appliedCount };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error?.message || String(error);

    if (error?.code === "42P07") {
      console.warn(
        "[migrations] Detected existing tables while applying migrations; checking whether the schema can be safely baselined...",
      );
      const readiness = await checkSchemaReadiness();

      if (schemaRequiredObjectsExist(readiness)) {
        const baselined = await autoBaselineMigrations();
        console.warn(
          `[migrations] Schema objects already present; baselined ${baselined} migration(s) without modifying application data`,
        );
        return {
          success: true,
          durationMs,
          appliedCount: 0,
        };
      }

      const missingObjects = [
        ...readiness.tablesCheck
          .filter((table) => !table.exists)
          .map((table) => table.table),
        ...readiness.columnsCheck
          .filter((column) => !column.exists)
          .map((column) => `${column.table}.${column.column}`),
      ];
      const guardedMessage =
        `Migration hit existing tables, but required schema objects are still missing: ${missingObjects.join(", ")}`;
      console.error("[migrations] MIGRATION BASELINE BLOCKED:", guardedMessage);
      return { success: false, error: guardedMessage, durationMs };
    }

    console.error(`[migrations] MIGRATION FAILED after ${durationMs}ms`);
    console.error("[migrations] Error:", errorMessage);
    console.error(
      "[migrations] Fix: Check migration SQL syntax or database permissions",
    );
    return { success: false, error: errorMessage, durationMs };
  }
}

export async function checkSchemaReadiness(): Promise<SchemaCheckResult> {
  const errors: string[] = [];
  let dbConnectionOk = false;
  let migrationAppliedCount = 0;
  let pendingMigrationTags: string[] = [];
  let lastMigrationTimestamp: string | null = null;
  let lastMigrationHash: string | null = null;

  try {
    await db.execute(sql`SELECT 1`);
    dbConnectionOk = true;
  } catch (error: any) {
    errors.push(`Database connection failed: ${error?.message || error}`);
  }

  if (dbConnectionOk) {
    try {
      const migInfo = await getMigrationInfo();
      migrationAppliedCount = migInfo.count;
      lastMigrationHash = migInfo.lastHash;
      lastMigrationTimestamp = migInfo.lastTimestamp;
      pendingMigrationTags = getPendingMigrationTags(lastMigrationTimestamp);
    } catch (error: any) {
      errors.push(`Failed to get migration info: ${error?.message || error}`);
    }
  }

  const tablesCheck: { table: string; exists: boolean }[] = [];
  for (const table of REQUIRED_TABLES) {
    const exists = dbConnectionOk ? await checkTableExists(table) : false;
    tablesCheck.push({ table, exists });
    if (!exists && CRITICAL_TABLES.includes(table)) {
      errors.push(`Critical table missing: ${table}`);
    }
  }

  const columnsCheck: { table: string; column: string; exists: boolean }[] = [];
  for (const { table, column } of REQUIRED_COLUMNS) {
    const exists = dbConnectionOk
      ? await checkColumnExists(table, column)
      : false;
    columnsCheck.push({ table, column, exists });
    if (
      !exists &&
      CRITICAL_COLUMNS.some((c) => c.table === table && c.column === column)
    ) {
      errors.push(`Critical column missing: ${table}.${column}`);
    } else if (
      !exists &&
      IMPORTANT_COLUMNS.some((c) => c.table === table && c.column === column)
    ) {
      errors.push(`Important column missing: ${table}.${column}`);
    }
  }

  const criticalTablesExist = CRITICAL_TABLES.every(
    (t) => tablesCheck.find((tc) => tc.table === t)?.exists ?? false,
  );
  const criticalColumnsExist = CRITICAL_COLUMNS.every(
    (c) =>
      columnsCheck.find((cc) => cc.table === c.table && cc.column === c.column)
        ?.exists ?? false,
  );
  const importantTablesExist = IMPORTANT_TABLES.every(
    (t) => tablesCheck.find((tc) => tc.table === t)?.exists ?? false,
  );
  const importantColumnsExist = IMPORTANT_COLUMNS.every(
    (c) =>
      columnsCheck.find((cc) => cc.table === c.table && cc.column === c.column)
        ?.exists ?? false,
  );
  const allTablesExist = tablesCheck.every((t) => t.exists);
  const allColumnsExist = columnsCheck.every((c) => c.exists);
  const isReady =
    dbConnectionOk &&
    criticalTablesExist &&
    criticalColumnsExist &&
    importantTablesExist &&
    importantColumnsExist &&
    pendingMigrationTags.length === 0;

  return {
    migrationAppliedCount,
    pendingMigrationCount: pendingMigrationTags.length,
    pendingMigrationTags,
    lastMigrationTimestamp,
    lastMigrationHash,
    dbConnectionOk,
    tablesCheck,
    columnsCheck,
    allTablesExist,
    allColumnsExist,
    isReady,
    errors,
  };
}

// Global state for health check reporting
let lastSchemaCheck: SchemaCheckResult | null = null;

export function getLastSchemaCheck(): SchemaCheckResult | null {
  return lastSchemaCheck;
}

export interface DegradedFeatures {
  missingImportant: string[];
  missingOptional: string[];
}

let degradedFeatures: DegradedFeatures = {
  missingImportant: [],
  missingOptional: [],
};

export function getDegradedFeatures(): DegradedFeatures {
  return degradedFeatures;
}

export async function ensureSchemaReady(): Promise<void> {
  const autoMigrate = process.env.AUTO_MIGRATE === "true";
  const fastStartup = process.env.FAST_STARTUP === "true";
  degradedFeatures = {
    missingImportant: [],
    missingOptional: [],
  };
  
  // FAST_STARTUP mode: Skip detailed checks BUT still run migrations if AUTO_MIGRATE is set
  if (fastStartup) {
    console.log(
      "[schema] FAST_STARTUP enabled - running minimal startup checks",
    );
    console.log("[schema] Verifying database connection (10s timeout)...");
    
    // Wrap the database check with a timeout to prevent hanging forever
    const DB_CONNECT_TIMEOUT_MS = 10000;
    try {
      const connectPromise = db.execute(sql`SELECT 1`);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Database connection timed out after ${DB_CONNECT_TIMEOUT_MS}ms`)), DB_CONNECT_TIMEOUT_MS)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      console.log("[schema] Database connection OK");
    } catch (error: any) {
      console.error(
        "[schema] FATAL: Database connection failed:",
        error?.message,
      );
      console.error("[schema] Check DATABASE_URL environment variable and database accessibility");
      throw new Error(`Database connection failed: ${error?.message}`);
    }
    
    // Still run migrations even in FAST_STARTUP mode if AUTO_MIGRATE is enabled
    if (autoMigrate) {
      console.log("[schema] AUTO_MIGRATE enabled - checking if migrations needed...");
      const preCheck = await checkSchemaReadiness();
      lastSchemaCheck = preCheck;
      
      if (schemaNeedsMigration(preCheck)) {
        console.log(
          `[schema] Schema not ready or migrations pending (${preCheck.pendingMigrationCount}) - running migrations...`,
        );
        const migResult = await runMigrations();
        if (!migResult.success) {
          console.error("[schema] FATAL: Migration failed:", migResult.error);
          throw new Error(`Migration failed: ${migResult.error}`);
        }
        console.log("[schema] Migrations completed successfully");
      } else {
        console.log("[schema] Schema already ready - skipping migrations");
      }
    }
    
    console.log("[schema] FAST_STARTUP complete");
    return;
  }

  const env = process.env.NODE_ENV || "development";
  const failOnSchemaIssues = process.env.FAIL_ON_SCHEMA_ISSUES !== "false";

  const schemaCheckStart = Date.now();
  console.log(
    `[schema] Schema check started at ${new Date(schemaCheckStart).toISOString()}`,
  );
  console.log(`[schema] AUTO_MIGRATE=${autoMigrate}, NODE_ENV=${env}`);

  let preCheck = await checkSchemaReadiness();
  lastSchemaCheck = preCheck;

  if (!preCheck.dbConnectionOk) {
    console.error("[schema] FATAL: Cannot connect to database");
    console.error("[schema] Errors:", preCheck.errors);
    console.error(
      "[schema] Fix: Check DATABASE_URL environment variable and database accessibility",
    );
    throw new Error("Database connection failed - cannot start application");
  }

  if (autoMigrate) {
    if (!schemaNeedsMigration(preCheck)) {
      console.log(
        "[schema] AUTO_MIGRATE enabled but schema already ready and no migrations are pending - skipping migrations",
      );
      console.log(
        "[schema] All required tables and columns present, no migration needed",
      );
    } else {
      if (preCheck.pendingMigrationCount > 0) {
        console.log(
          `[schema] Pending migrations: ${preCheck.pendingMigrationTags.join(", ")}`,
        );
      }
      console.log("[schema] AUTO_MIGRATE enabled - running migrations...");
      const migResult = await runMigrations();
      if (!migResult.success) {
        console.error("[schema] FATAL: Migration failed");
        console.error("[schema] Error:", migResult.error);
        console.error(
          "[schema] Fix: Check migration SQL syntax or database permissions",
        );
        throw new Error(`Migration failed: ${migResult.error}`);
      }
      preCheck = await checkSchemaReadiness();
      lastSchemaCheck = preCheck;
    }
  } else {
    console.log(
      "[schema] AUTO_MIGRATE disabled - skipping automatic migrations",
    );
  }

  console.log(`[schema] Migrations applied: ${preCheck.migrationAppliedCount}`);
  if (preCheck.lastMigrationHash) {
    console.log(`[schema] Last migration: ${preCheck.lastMigrationHash}`);
  }
  if (preCheck.pendingMigrationCount > 0) {
    console.warn(
      `[schema] Pending migrations remain: ${preCheck.pendingMigrationTags.join(", ")}`,
    );
  }

  const tableStatus = preCheck.tablesCheck.reduce(
    (acc, t) => {
      acc[t.table] = t.exists;
      return acc;
    },
    {} as Record<string, boolean>,
  );

  const columnStatus = preCheck.columnsCheck.reduce(
    (acc, c) => {
      acc[`${c.table}.${c.column}`] = c.exists;
      return acc;
    },
    {} as Record<string, boolean>,
  );

  const missingCriticalTables = CRITICAL_TABLES.filter((t) => !tableStatus[t]);
  const missingCriticalColumns = CRITICAL_COLUMNS.filter(
    (c) => !columnStatus[`${c.table}.${c.column}`],
  );

  if (missingCriticalTables.length > 0 || missingCriticalColumns.length > 0) {
    console.error(
      "[schema] FATAL: Missing CRITICAL tables:",
      missingCriticalTables.join(", ") || "none",
    );
    console.error(
      "[schema] FATAL: Missing CRITICAL columns:",
      missingCriticalColumns.map((c) => `${c.table}.${c.column}`).join(", ") ||
        "none",
    );
    console.error(
      "[schema] Fix: Set AUTO_MIGRATE=true or run: npx tsx server/scripts/migrate.ts",
    );
    throw new Error(
      `Critical schema missing: tables=[${missingCriticalTables.join(", ")}] columns=[${missingCriticalColumns.map((c) => `${c.table}.${c.column}`).join(", ")}]`,
    );
  }

  const missingImportantTables = IMPORTANT_TABLES.filter(
    (t) => !tableStatus[t],
  );
  const missingImportantColumns = IMPORTANT_COLUMNS.filter(
    (c) => !columnStatus[`${c.table}.${c.column}`],
  );
  if (missingImportantTables.length > 0) {
    console.error(
      `[schema] ERROR: Missing IMPORTANT tables (degraded mode): ${missingImportantTables.join(", ")}`,
    );
    console.error(
      "[schema] Features affected: error logging, notifications, email sending",
    );
    degradedFeatures.missingImportant = missingImportantTables;
  }
  if (missingImportantColumns.length > 0) {
    console.error(
      `[schema] ERROR: Missing IMPORTANT columns: ${missingImportantColumns.map((c) => `${c.table}.${c.column}`).join(", ")}`,
    );
    degradedFeatures.missingImportant = [
      ...degradedFeatures.missingImportant,
      ...missingImportantColumns.map((c) => `${c.table}.${c.column}`),
    ];
  }

  if (
    failOnSchemaIssues &&
    (missingImportantTables.length > 0 ||
      missingImportantColumns.length > 0 ||
      preCheck.pendingMigrationCount > 0)
  ) {
    throw new Error(
      `Schema is not production-ready: importantTables=[${missingImportantTables.join(", ")}] importantColumns=[${missingImportantColumns.map((c) => `${c.table}.${c.column}`).join(", ")}] pendingMigrations=[${preCheck.pendingMigrationTags.join(", ")}]`,
    );
  }

  const missingOptionalTables = OPTIONAL_TABLES.filter((t) => !tableStatus[t]);
  const missingOptionalColumns = OPTIONAL_COLUMNS.filter(
    (c) => !columnStatus[`${c.table}.${c.column}`],
  );
  if (missingOptionalTables.length > 0) {
    console.warn(
      `[schema] WARNING: Missing OPTIONAL tables (features disabled): ${missingOptionalTables.join(", ")}`,
    );
    degradedFeatures.missingOptional = missingOptionalTables;
  }
  if (missingOptionalColumns.length > 0) {
    console.warn(
      `[schema] WARNING: Missing OPTIONAL columns: ${missingOptionalColumns.map((c) => `${c.table}.${c.column}`).join(", ")}`,
    );
  }

  const schemaCheckDuration = Date.now() - schemaCheckStart;

  const hasCritical =
    missingCriticalTables.length > 0 || missingCriticalColumns.length > 0;
  const hasImportant =
    missingImportantTables.length > 0 ||
    missingImportantColumns.length > 0 ||
    preCheck.pendingMigrationCount > 0;
  const hasOptional =
    missingOptionalTables.length > 0 || missingOptionalColumns.length > 0;

  if (!hasCritical && !hasImportant && !hasOptional) {
    console.log(
      `[schema] Schema check completed in ${schemaCheckDuration}ms - all tables and columns exist`,
    );
  } else if (!hasCritical) {
    console.log(
      `[schema] Schema check completed in ${schemaCheckDuration}ms - app starting with degraded features`,
    );
  }
}
