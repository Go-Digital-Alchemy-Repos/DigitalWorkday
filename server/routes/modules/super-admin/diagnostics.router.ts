import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';

export const diagnosticsRouter = Router();

const REQUIRED_SCHEMA: Record<string, string[]> = {
  notifications: ["id", "user_id", "tenant_id", "type", "title", "message", "is_read", "created_at"],
  notification_preferences: ["id", "user_id", "tenant_id", "preference_type", "channel", "enabled"],
  tenant_settings: ["id", "tenant_id", "chat_retention_days"],
  users: ["id", "tenant_id", "email", "role", "is_active"],
  tenants: ["id", "name", "slug", "status"],
  projects: ["id", "tenant_id", "name", "status"],
  tasks: ["id", "tenant_id", "project_id", "title", "status"],
  clients: ["id", "tenant_id", "company_name"],
  teams: ["id", "tenant_id", "name"],
  workspaces: ["id", "tenant_id", "name"],
};

const REQUIRED_CHECKS = [
  { table: "notifications", column: "tenant_id", description: "notifications.tenant_id exists" },
  { table: "notification_preferences", column: null, description: "notification_preferences table exists" },
  { table: "tenant_settings", column: "chat_retention_days", description: "tenant_settings.chat_retention_days exists" },
  { table: "users", column: "tenant_id", description: "users.tenant_id exists" },
  { table: "projects", column: "tenant_id", description: "projects.tenant_id exists" },
  { table: "tasks", column: "tenant_id", description: "tasks.tenant_id exists" },
];

diagnosticsRouter.get("/system/db-introspect", requireSuperUser, async (req, res) => {
  try {
    const maintenanceEnabled = process.env.MAINTENANCE_TOOLS !== "false";
    if (!maintenanceEnabled) {
      return res.status(403).json({ 
        error: "Maintenance tools disabled",
        message: "Set MAINTENANCE_TOOLS=true to enable DB introspection"
      });
    }

    const dbUrl = process.env.DATABASE_URL || "";
    let hostHint = "unknown";
    let nameHint = "unknown";
    try {
      const url = new URL(dbUrl);
      hostHint = url.hostname.includes("railway") ? "railway-postgres" : 
                 url.hostname.includes("neon") ? "neon-postgres" :
                 url.hostname.includes("supabase") ? "supabase-postgres" : 
                 "postgres";
      nameHint = url.pathname.replace("/", "").substring(0, 4) + "...(masked)";
    } catch {
    }

    const tablesResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const existingTables = new Set((tablesResult.rows as any[]).map(r => r.table_name));

    const columnsResult = await db.execute(sql`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    
    const columnsByTable: Record<string, string[]> = {};
    for (const row of columnsResult.rows as any[]) {
      if (!columnsByTable[row.table_name]) {
        columnsByTable[row.table_name] = [];
      }
      columnsByTable[row.table_name].push(row.column_name);
    }

    const tables = Object.entries(REQUIRED_SCHEMA).map(([tableName, expectedColumns]) => ({
      name: tableName,
      exists: existingTables.has(tableName),
      columns: columnsByTable[tableName] || [],
      missingColumns: expectedColumns.filter(col => 
        !(columnsByTable[tableName] || []).includes(col)
      ),
    }));

    const requiredChecks = REQUIRED_CHECKS.map(check => {
      const tableExists = existingTables.has(check.table);
      const columns = columnsByTable[check.table] || [];
      
      let ok = false;
      if (check.column === null) {
        ok = tableExists;
      } else {
        ok = tableExists && columns.includes(check.column);
      }
      
      return {
        check: check.description,
        ok,
      };
    });

    const failedChecks = requiredChecks.filter(c => !c.ok);

    res.json({
      generatedAt: new Date().toISOString(),
      database: {
        hostHint,
        nameHint,
      },
      tables,
      requiredChecks,
      summary: {
        totalTables: existingTables.size,
        checkedTables: tables.length,
        passedChecks: requiredChecks.filter(c => c.ok).length,
        failedChecks: failedChecks.length,
        hasSchemaDrift: failedChecks.length > 0,
      },
    });
  } catch (error) {
    console.error("[db-introspect] Failed to introspect database:", error);
    res.status(500).json({ error: "Failed to introspect database schema" });
  }
});

diagnosticsRouter.get("/diagnostics/schema", requireSuperUser, async (_req, res) => {
  try {
    const { checkSchemaReadiness } = await import("../../../startup/schemaReadiness");
    const schemaCheck = await checkSchemaReadiness();
    
    res.json({
      generatedAt: new Date().toISOString(),
      isReady: schemaCheck.isReady,
      dbConnectionOk: schemaCheck.dbConnectionOk,
      migrations: {
        appliedCount: schemaCheck.migrationAppliedCount,
        lastMigrationHash: schemaCheck.lastMigrationHash,
        lastMigrationTimestamp: schemaCheck.lastMigrationTimestamp,
      },
      tables: schemaCheck.tablesCheck.map(t => ({
        table: t.table,
        exists: t.exists,
      })),
      columns: schemaCheck.columnsCheck.map(c => ({
        table: c.table,
        column: c.column,
        exists: c.exists,
      })),
      summary: {
        allTablesExist: schemaCheck.allTablesExist,
        allColumnsExist: schemaCheck.allColumnsExist,
        missingTables: schemaCheck.tablesCheck.filter(t => !t.exists).map(t => t.table),
        missingColumns: schemaCheck.columnsCheck.filter(c => !c.exists).map(c => `${c.table}.${c.column}`),
        errors: schemaCheck.errors,
      },
    });
  } catch (error) {
    console.error("[schema-diagnostics] Failed to check schema:", error);
    res.status(500).json({ error: "Failed to check schema readiness" });
  }
});
