/**
 * Tenancy Remediation Script
 * 
 * Safely backfills missing tenant_id values using relationship chains.
 * NEVER deletes data - only updates resolvable rows.
 * Unresolved rows remain NULL and are reported for manual intervention.
 * 
 * Run: npx tsx server/scripts/tenancyRemediate.ts [--dry-run]
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface RemediationResult {
  table: string;
  totalNull: number;
  updated: number;
  unresolved: number;
  details?: string[];
}

interface RemediationReport {
  timestamp: string;
  mode: "dry-run" | "live";
  results: RemediationResult[];
  summary: {
    totalTablesChecked: number;
    tablesWithDrift: number;
    totalUpdated: number;
    totalUnresolved: number;
  };
  unresolvedDetails: { table: string; ids: string[]; reason: string }[];
}

const TENANT_SCOPED_TABLES = [
  // Core tables that MUST have tenant_id (except super_users)
  "workspaces",
  "teams",
  "clients",
  "projects",
  "tasks",
  "time_entries",
  "active_timers",
  "invitations",
  "personal_task_sections",
  "task_assignees",
  "task_watchers",
  "client_divisions",
  "division_members",
  // Chat tables
  "chat_channels",
  "chat_channel_members",
  "chat_dm_threads",
  "chat_dm_members",
  "chat_messages",
  "chat_mentions",
  "chat_reads",
  "chat_attachments",
];

// Tables where NULL tenant_id is expected for some rows
const SPECIAL_CASES = {
  users: "super_user role does not require tenant_id",
  tenant_integrations: "system-level integrations have NULL tenant_id",
  error_logs: "super admin errors may have NULL tenant_id",
  email_outbox: "system emails may have NULL tenant_id",
  app_settings: "system-level settings have NULL tenant_id",
};

async function countNullTenantId(table: string): Promise<number> {
  const result = await db.execute<{ count: string }>(
    sql.raw(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id IS NULL`)
  );
  return parseInt(result.rows[0]?.count || "0", 10);
}

async function getUnresolvedIds(table: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(
    sql.raw(`SELECT id FROM ${table} WHERE tenant_id IS NULL LIMIT 50`)
  );
  return result.rows.map((r) => r.id);
}

/**
 * Backfill strategies for each table based on relationships
 */
async function backfillTable(
  table: string,
  dryRun: boolean
): Promise<RemediationResult> {
  const initialNull = await countNullTenantId(table);
  
  if (initialNull === 0) {
    return { table, totalNull: 0, updated: 0, unresolved: 0 };
  }

  let updateQuery: string | null = null;
  let details: string[] = [];

  switch (table) {
    // Workspace has no parent - cannot auto-backfill
    case "workspaces":
      details.push("Workspaces require manual tenant assignment");
      break;

    // Teams -> workspace -> tenant
    case "teams":
      updateQuery = `
        UPDATE teams t
        SET tenant_id = w.tenant_id
        FROM workspaces w
        WHERE t.workspace_id = w.id
          AND t.tenant_id IS NULL
          AND w.tenant_id IS NOT NULL
      `;
      break;

    // Clients -> has tenant_id directly, use created_by -> users -> tenant_id
    case "clients":
      updateQuery = `
        UPDATE clients c
        SET tenant_id = u.tenant_id
        FROM users u
        WHERE c.created_by = u.id
          AND c.tenant_id IS NULL
          AND u.tenant_id IS NOT NULL
      `;
      break;

    // Projects -> client -> tenant OR workspace -> tenant
    case "projects":
      updateQuery = `
        UPDATE projects p
        SET tenant_id = COALESCE(
          (SELECT c.tenant_id FROM clients c WHERE c.id = p.client_id AND c.tenant_id IS NOT NULL),
          (SELECT w.tenant_id FROM workspaces w WHERE w.id = p.workspace_id AND w.tenant_id IS NOT NULL)
        )
        WHERE p.tenant_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM clients c WHERE c.id = p.client_id AND c.tenant_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = p.workspace_id AND w.tenant_id IS NOT NULL)
          )
      `;
      break;

    // Tasks -> project -> tenant
    case "tasks":
      updateQuery = `
        UPDATE tasks t
        SET tenant_id = p.tenant_id
        FROM projects p
        WHERE t.project_id = p.id
          AND t.tenant_id IS NULL
          AND p.tenant_id IS NOT NULL
      `;
      break;

    // Time entries -> task -> project -> tenant
    case "time_entries":
      updateQuery = `
        UPDATE time_entries te
        SET tenant_id = t.tenant_id
        FROM tasks t
        WHERE te.task_id = t.id
          AND te.tenant_id IS NULL
          AND t.tenant_id IS NOT NULL
      `;
      break;

    // Active timers -> task -> tenant OR user -> tenant
    case "active_timers":
      updateQuery = `
        UPDATE active_timers at
        SET tenant_id = COALESCE(
          (SELECT t.tenant_id FROM tasks t WHERE t.id = at.task_id AND t.tenant_id IS NOT NULL),
          (SELECT u.tenant_id FROM users u WHERE u.id = at.user_id AND u.tenant_id IS NOT NULL)
        )
        WHERE at.tenant_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM tasks t WHERE t.id = at.task_id AND t.tenant_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM users u WHERE u.id = at.user_id AND u.tenant_id IS NOT NULL)
          )
      `;
      break;

    // Invitations -> use tenant_id from inviter (user)
    case "invitations":
      updateQuery = `
        UPDATE invitations i
        SET tenant_id = u.tenant_id
        FROM users u
        WHERE i.invited_by = u.id
          AND i.tenant_id IS NULL
          AND u.tenant_id IS NOT NULL
      `;
      break;

    // Personal task sections -> user -> tenant
    case "personal_task_sections":
      updateQuery = `
        UPDATE personal_task_sections pts
        SET tenant_id = u.tenant_id
        FROM users u
        WHERE pts.user_id = u.id
          AND pts.tenant_id IS NULL
          AND u.tenant_id IS NOT NULL
      `;
      break;

    // Task assignees -> task -> tenant
    case "task_assignees":
      updateQuery = `
        UPDATE task_assignees ta
        SET tenant_id = t.tenant_id
        FROM tasks t
        WHERE ta.task_id = t.id
          AND ta.tenant_id IS NULL
          AND t.tenant_id IS NOT NULL
      `;
      break;

    // Task watchers -> task -> tenant
    case "task_watchers":
      updateQuery = `
        UPDATE task_watchers tw
        SET tenant_id = t.tenant_id
        FROM tasks t
        WHERE tw.task_id = t.id
          AND tw.tenant_id IS NULL
          AND t.tenant_id IS NOT NULL
      `;
      break;

    // Client divisions -> client -> tenant
    case "client_divisions":
      updateQuery = `
        UPDATE client_divisions cd
        SET tenant_id = c.tenant_id
        FROM clients c
        WHERE cd.client_id = c.id
          AND cd.tenant_id IS NULL
          AND c.tenant_id IS NOT NULL
      `;
      break;

    // Division members -> division -> client -> tenant
    case "division_members":
      updateQuery = `
        UPDATE division_members dm
        SET tenant_id = cd.tenant_id
        FROM client_divisions cd
        WHERE dm.division_id = cd.id
          AND dm.tenant_id IS NULL
          AND cd.tenant_id IS NOT NULL
      `;
      break;

    // Chat channels -> created_by user -> tenant OR workspace -> tenant
    case "chat_channels":
      updateQuery = `
        UPDATE chat_channels cc
        SET tenant_id = COALESCE(
          (SELECT u.tenant_id FROM users u WHERE u.id = cc.created_by AND u.tenant_id IS NOT NULL),
          (SELECT w.tenant_id FROM workspaces w WHERE w.id = cc.workspace_id AND w.tenant_id IS NOT NULL)
        )
        WHERE cc.tenant_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM users u WHERE u.id = cc.created_by AND u.tenant_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = cc.workspace_id AND w.tenant_id IS NOT NULL)
          )
      `;
      break;

    // Chat channel members -> channel -> tenant
    case "chat_channel_members":
      updateQuery = `
        UPDATE chat_channel_members ccm
        SET tenant_id = cc.tenant_id
        FROM chat_channels cc
        WHERE ccm.channel_id = cc.id
          AND ccm.tenant_id IS NULL
          AND cc.tenant_id IS NOT NULL
      `;
      break;

    // Chat DM threads -> participant users (only if BOTH users share same tenant)
    case "chat_dm_threads":
      updateQuery = `
        UPDATE chat_dm_threads dt
        SET tenant_id = u1.tenant_id
        FROM users u1, users u2
        WHERE dt.user1_id = u1.id
          AND dt.user2_id = u2.id
          AND dt.tenant_id IS NULL
          AND u1.tenant_id IS NOT NULL
          AND u2.tenant_id IS NOT NULL
          AND u1.tenant_id = u2.tenant_id
      `;
      details.push("Only updates DM threads where both users share the same tenant");
      break;

    // Chat DM members -> DM thread -> tenant
    case "chat_dm_members":
      updateQuery = `
        UPDATE chat_dm_members dm
        SET tenant_id = dt.tenant_id
        FROM chat_dm_threads dt
        WHERE dm.dm_thread_id = dt.id
          AND dm.tenant_id IS NULL
          AND dt.tenant_id IS NOT NULL
      `;
      break;

    // Chat messages -> channel OR dm_thread -> tenant
    case "chat_messages":
      updateQuery = `
        UPDATE chat_messages cm
        SET tenant_id = COALESCE(
          (SELECT cc.tenant_id FROM chat_channels cc WHERE cc.id = cm.channel_id AND cc.tenant_id IS NOT NULL),
          (SELECT dt.tenant_id FROM chat_dm_threads dt WHERE dt.id = cm.dm_thread_id AND dt.tenant_id IS NOT NULL)
        )
        WHERE cm.tenant_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM chat_channels cc WHERE cc.id = cm.channel_id AND cc.tenant_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM chat_dm_threads dt WHERE dt.id = cm.dm_thread_id AND dt.tenant_id IS NOT NULL)
          )
      `;
      break;

    // Chat mentions -> message -> tenant
    case "chat_mentions":
      updateQuery = `
        UPDATE chat_mentions cm
        SET tenant_id = msg.tenant_id
        FROM chat_messages msg
        WHERE cm.message_id = msg.id
          AND cm.tenant_id IS NULL
          AND msg.tenant_id IS NOT NULL
      `;
      break;

    // Chat reads -> channel/dm_thread -> tenant
    case "chat_reads":
      updateQuery = `
        UPDATE chat_reads cr
        SET tenant_id = COALESCE(
          (SELECT cc.tenant_id FROM chat_channels cc WHERE cc.id = cr.channel_id AND cc.tenant_id IS NOT NULL),
          (SELECT dt.tenant_id FROM chat_dm_threads dt WHERE dt.id = cr.dm_thread_id AND dt.tenant_id IS NOT NULL)
        )
        WHERE cr.tenant_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM chat_channels cc WHERE cc.id = cr.channel_id AND cc.tenant_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM chat_dm_threads dt WHERE dt.id = cr.dm_thread_id AND dt.tenant_id IS NOT NULL)
          )
      `;
      break;

    // Chat attachments -> message -> tenant
    case "chat_attachments":
      updateQuery = `
        UPDATE chat_attachments ca
        SET tenant_id = cm.tenant_id
        FROM chat_messages cm
        WHERE ca.message_id = cm.id
          AND ca.tenant_id IS NULL
          AND cm.tenant_id IS NOT NULL
      `;
      break;

    default:
      details.push(`No backfill strategy defined for ${table}`);
  }

  let updated = 0;
  if (updateQuery && !dryRun) {
    const result = await db.execute(sql.raw(updateQuery));
    updated = (result as any).rowCount || 0;
  } else if (updateQuery && dryRun) {
    details.push("Would execute backfill query (dry-run mode)");
  }

  const finalNull = dryRun ? initialNull : await countNullTenantId(table);
  const unresolved = dryRun ? initialNull : finalNull;

  return {
    table,
    totalNull: initialNull,
    updated: dryRun ? 0 : updated,
    unresolved,
    details: details.length > 0 ? details : undefined,
  };
}

/**
 * Check users table - super_users are allowed to have NULL tenant_id
 */
async function checkUsersTable(): Promise<RemediationResult & { unresolvedIds?: string[] }> {
  const result = await db.execute<{ id: string; email: string; role: string }>(
    sql`SELECT id, email, role FROM users WHERE tenant_id IS NULL`
  );
  
  const superUsers = result.rows.filter((u) => u.role === "super_user");
  const nonSuperUsers = result.rows.filter((u) => u.role !== "super_user");

  return {
    table: "users",
    totalNull: result.rows.length,
    updated: 0,
    unresolved: nonSuperUsers.length,
    details: [
      `${superUsers.length} super_user(s) without tenant_id (expected)`,
      `${nonSuperUsers.length} non-super user(s) without tenant_id (need remediation)`,
    ],
    unresolvedIds: nonSuperUsers.map((u) => u.id),
  };
}

async function runRemediation(dryRun: boolean): Promise<RemediationReport> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TENANCY REMEDIATION SCRIPT`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (no changes)" : "LIVE (applying changes)"}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  const results: RemediationResult[] = [];
  const unresolvedDetails: { table: string; ids: string[]; reason: string }[] = [];

  // Check users table (special handling for super_users)
  console.log("Checking users table...");
  const usersResult = await checkUsersTable();
  results.push(usersResult);
  if (usersResult.unresolved > 0 && usersResult.unresolvedIds) {
    unresolvedDetails.push({
      table: "users",
      ids: usersResult.unresolvedIds,
      reason: "Non-super users without tenant_id require manual assignment or deletion",
    });
  }

  // Process tenant-scoped tables
  for (const table of TENANT_SCOPED_TABLES) {
    console.log(`Processing ${table}...`);
    try {
      const result = await backfillTable(table, dryRun);
      results.push(result);
      
      if (result.unresolved > 0) {
        const unresolvedIds = await getUnresolvedIds(table);
        unresolvedDetails.push({
          table,
          ids: unresolvedIds,
          reason: result.details?.join("; ") || "Could not determine tenant from relationships",
        });
      }
    } catch (error) {
      console.error(`Error processing ${table}:`, error);
      results.push({
        table,
        totalNull: -1,
        updated: 0,
        unresolved: -1,
        details: [`Error: ${(error as Error).message}`],
      });
    }
  }

  // Summary
  const tablesWithDrift = results.filter((r) => r.totalNull > 0).length;
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalUnresolved = results.reduce((sum, r) => sum + Math.max(0, r.unresolved), 0);

  const report: RemediationReport = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "live",
    results,
    summary: {
      totalTablesChecked: results.length,
      tablesWithDrift,
      totalUpdated,
      totalUnresolved,
    },
    unresolvedDetails,
  };

  // Print report
  console.log(`\n${"=".repeat(60)}`);
  console.log("REMEDIATION REPORT");
  console.log(`${"=".repeat(60)}`);
  
  console.log("\nTable Results:");
  console.log("-".repeat(60));
  for (const r of results) {
    if (r.totalNull > 0 || r.unresolved > 0) {
      console.log(`${r.table}:`);
      console.log(`  NULL before: ${r.totalNull}, Updated: ${r.updated}, Unresolved: ${r.unresolved}`);
      if (r.details) {
        r.details.forEach((d) => console.log(`  - ${d}`));
      }
    }
  }

  console.log("\nSummary:");
  console.log(`  Tables checked: ${report.summary.totalTablesChecked}`);
  console.log(`  Tables with drift: ${report.summary.tablesWithDrift}`);
  console.log(`  Total rows updated: ${report.summary.totalUpdated}`);
  console.log(`  Total unresolved: ${report.summary.totalUnresolved}`);

  if (unresolvedDetails.length > 0) {
    console.log("\nUnresolved Items (require manual intervention):");
    console.log("-".repeat(60));
    for (const detail of unresolvedDetails) {
      console.log(`${detail.table}: ${detail.ids.length} row(s)`);
      console.log(`  Reason: ${detail.reason}`);
      console.log(`  IDs: ${detail.ids.slice(0, 5).join(", ")}${detail.ids.length > 5 ? "..." : ""}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("END OF REPORT");
  console.log(`${"=".repeat(60)}\n`);

  return report;
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  
  if (!dryRun) {
    console.log("\n⚠️  WARNING: Running in LIVE mode. Changes will be applied to the database.");
    console.log("    Use --dry-run to preview changes without applying them.\n");
  }

  try {
    const report = await runRemediation(dryRun);
    
    // Exit with error code if there are unresolved items
    if (report.summary.totalUnresolved > 0) {
      console.log(`\n⚠️  ${report.summary.totalUnresolved} unresolved row(s) require manual attention.`);
      process.exit(1);
    }
    
    console.log("\n✅ Remediation complete. All tenant_id values are resolved.");
    process.exit(0);
  } catch (error) {
    console.error("Fatal error during remediation:", error);
    process.exit(2);
  }
}

main();
