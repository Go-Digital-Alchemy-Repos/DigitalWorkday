import { describe, expect, it } from "vitest";
import {
  CRITICAL_COLUMNS,
  CRITICAL_TABLES,
  IMPORTANT_COLUMNS,
  IMPORTANT_TABLES,
  schemaNeedsMigration,
  schemaRequiredObjectsExist,
  type SchemaCheckResult,
} from "../startup/schemaReadiness";

function makeSchemaCheck(
  overrides: Partial<SchemaCheckResult> = {},
): SchemaCheckResult {
  const tablesCheck = [...CRITICAL_TABLES, ...IMPORTANT_TABLES].map((table) => ({
    table,
    exists: true,
  }));
  const columnsCheck = [...CRITICAL_COLUMNS, ...IMPORTANT_COLUMNS].map(
    ({ table, column }) => ({
      table,
      column,
      exists: true,
    }),
  );

  return {
    migrationAppliedCount: 10,
    pendingMigrationCount: 0,
    pendingMigrationTags: [],
    lastMigrationTimestamp: "1778007600000",
    lastMigrationHash: "0047_archive_project_sections",
    dbConnectionOk: true,
    tablesCheck,
    columnsCheck,
    allTablesExist: true,
    allColumnsExist: true,
    isReady: true,
    errors: [],
    ...overrides,
  };
}

describe("schema readiness guards", () => {
  it("tracks recent feature schema as important startup requirements", () => {
    expect(IMPORTANT_TABLES).toEqual(
      expect.arrayContaining([
        "sections",
        "task_attachments",
        "active_timers",
        "chat_reads",
        "chat_thread_reads",
      ]),
    );
    expect(IMPORTANT_COLUMNS).toEqual(
      expect.arrayContaining([
        { table: "sections", column: "archived_at" },
        { table: "sections", column: "archived_by" },
        { table: "active_timers", column: "subtask_id" },
        { table: "task_attachments", column: "subtask_id" },
      ]),
    );
  });

  it("requires migrations when pending migration files remain", () => {
    expect(schemaNeedsMigration(makeSchemaCheck())).toBe(false);
    expect(
      schemaNeedsMigration(
        makeSchemaCheck({
          pendingMigrationCount: 1,
          pendingMigrationTags: ["0047_archive_project_sections"],
          isReady: false,
        }),
      ),
    ).toBe(true);
  });

  it("blocks migration baselining when required feature columns are missing", () => {
    const missingArchiveColumn = makeSchemaCheck({
      columnsCheck: makeSchemaCheck().columnsCheck.map((column) =>
        column.table === "sections" && column.column === "archived_at"
          ? { ...column, exists: false }
          : column,
      ),
      allColumnsExist: false,
      isReady: false,
    });

    expect(schemaRequiredObjectsExist(makeSchemaCheck())).toBe(true);
    expect(schemaRequiredObjectsExist(missingArchiveColumn)).toBe(false);
  });
});
