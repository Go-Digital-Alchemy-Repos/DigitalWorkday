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
    migrationAppliedCount: 11,
    pendingMigrationCount: 0,
    pendingMigrationTags: [],
    lastMigrationTimestamp: "1778007600000",
    lastMigrationHash: "0048_customer_access_permissions",
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
        "client_divisions",
        "division_members",
        "client_user_access",
        "user_client_access",
        "comment_mentions",
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
        { table: "client_invites", column: "access_client_ids" },
        { table: "client_user_access", column: "access_level" },
        { table: "user_client_access", column: "workspace_id" },
        { table: "user_client_access", column: "access_level" },
        { table: "user_client_access", column: "permissions" },
        { table: "client_divisions", column: "client_id" },
        { table: "division_members", column: "division_id" },
        { table: "comments", column: "visibility" },
        { table: "comment_mentions", column: "mentioned_user_id" },
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

  it("blocks readiness when customer portal access schema is missing", () => {
    const missingPortalAccessTable = makeSchemaCheck({
      tablesCheck: makeSchemaCheck().tablesCheck.map((table) =>
        table.table === "client_user_access"
          ? { ...table, exists: false }
          : table,
      ),
      allTablesExist: false,
      isReady: false,
    });
    const missingCommentVisibility = makeSchemaCheck({
      columnsCheck: makeSchemaCheck().columnsCheck.map((column) =>
        column.table === "comments" && column.column === "visibility"
          ? { ...column, exists: false }
          : column,
      ),
      allColumnsExist: false,
      isReady: false,
    });

    expect(schemaRequiredObjectsExist(missingPortalAccessTable)).toBe(false);
    expect(schemaRequiredObjectsExist(missingCommentVisibility)).toBe(false);
  });
});
