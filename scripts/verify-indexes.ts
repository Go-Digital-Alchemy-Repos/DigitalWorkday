import { db } from "../server/db";
import { sql } from "drizzle-orm";

const KEY_TABLES = ["tasks", "task_assignees", "projects", "time_entries", "comments"];

const EXPECTED_INDEXES = [
  "tasks_project_id_idx",
  "tasks_project_status_idx",
  "tasks_status_priority_idx",
  "tasks_tenant_idx",
  "tasks_tenant_project_idx",
  "tasks_tenant_status_idx",
  "tasks_tenant_due_date_idx",
  "tasks_due_date",
  "task_assignees_task_id_idx",
  "task_assignees_unique",
  "task_assignees_tenant_idx",
  "projects_workspace_id_idx",
  "projects_tenant_workspace_idx",
  "projects_status_idx",
  "projects_tenant_idx",
  "projects_tenant_status_idx",
  "projects_tenant_client_idx",
  "time_entries_tenant_idx",
  "time_entries_project_idx",
  "time_entries_tenant_user_start_idx",
  "time_entries_tenant_project_start_idx",
  "comments_task_created",
  "comments_subtask_id_idx",
  "comments_user_idx",
];

async function main() {
  console.log("=== Database Index Verification ===\n");

  const tableList = KEY_TABLES.map((t) => `'${t}'`).join(", ");
  const result = await db.execute(sql.raw(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (${tableList})
    ORDER BY tablename, indexname
  `));

  const rows = result.rows as Array<{ tablename: string; indexname: string; indexdef: string }>;

  let currentTable = "";
  const foundIndexes = new Set<string>();

  for (const row of rows) {
    if (row.tablename !== currentTable) {
      currentTable = row.tablename;
      console.log(`\n--- ${currentTable} ---`);
    }
    console.log(`  ${row.indexname}`);
    console.log(`    ${row.indexdef}`);
    foundIndexes.add(row.indexname);
  }

  console.log("\n\n=== Expected Index Check ===\n");

  let missing = 0;
  for (const idx of EXPECTED_INDEXES) {
    const status = foundIndexes.has(idx) ? "OK" : "MISSING";
    const marker = status === "OK" ? "[+]" : "[!]";
    console.log(`  ${marker} ${idx} — ${status}`);
    if (status === "MISSING") missing++;
  }

  console.log(`\nTotal expected: ${EXPECTED_INDEXES.length}, Found: ${EXPECTED_INDEXES.length - missing}, Missing: ${missing}`);

  if (missing > 0) {
    console.log("\nWARNING: Some expected indexes are missing. Run 'npx drizzle-kit migrate' to apply.");
    process.exit(1);
  } else {
    console.log("\nAll expected indexes are present.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
