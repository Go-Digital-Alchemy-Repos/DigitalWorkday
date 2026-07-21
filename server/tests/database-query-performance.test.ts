import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SCHEMA_PATH = path.join(ROOT, "shared", "schema.ts");
const MIGRATION_PATH = path.join(ROOT, "migrations", "0050_query_performance_indexes.sql");
const CONVERSATIONS_ROUTER_PATH = path.join(ROOT, "server", "routes", "modules", "crm", "conversations.router.ts");

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("database query performance guardrails", () => {
  it("keeps high-value list query indexes in schema and migrations", () => {
    const schema = read(SCHEMA_PATH);
    const migration = read(MIGRATION_PATH);

    const indexes = [
      "notifications_user_dismissed_created_idx",
      "notifications_user_dismissed_read_created_idx",
      "client_conversations_tenant_client_updated_idx",
      "client_conversations_tenant_updated_idx",
      "client_messages_conversation_created_idx",
      "support_tickets_tenant_last_activity_idx",
      "support_tickets_tenant_client_last_activity_idx",
    ];

    for (const indexName of indexes) {
      expect(schema, `${indexName} missing from shared schema`).toContain(indexName);
      expect(migration, `${indexName} missing from 0050 migration`).toContain(indexName);
    }
  });

  it("keeps CRM merge-candidate metadata batched instead of per conversation", () => {
    const source = read(CONVERSATIONS_ROUTER_PATH);
    const routeStart = source.indexOf('"/crm/clients/:clientId/conversations/merge-candidates"');
    const routeEnd = source.indexOf('"/crm/portal/conversations"', routeStart);
    expect(routeStart).toBeGreaterThan(-1);
    expect(routeEnd).toBeGreaterThan(routeStart);

    const routeSource = source.slice(routeStart, routeEnd);
    expect(routeSource).toContain(".groupBy(clientMessages.conversationId)");
    expect(routeSource).toContain(".leftJoin(messageMeta");
    expect(routeSource).not.toContain("Promise.all(filtered.map");
  });
});
