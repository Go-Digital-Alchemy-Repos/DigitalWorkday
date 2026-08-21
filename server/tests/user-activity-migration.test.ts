import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("user activity migration privacy contract", () => {
  const sql = fs.readFileSync(path.resolve(process.cwd(), "migrations/0058_user_activity_sessions.sql"), "utf8");

  it("creates the session table after migration 0057 with retention-query indexes", () => {
    const journal = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "migrations/meta/_journal.json"), "utf8"));
    const entry = journal.entries.find((item: { tag: string }) => item.tag === "0058_user_activity_sessions");
    expect(entry?.idx).toBe(20);
    expect(journal.entries[19].tag).toBe("0057_client_conversation_recipients");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "user_activity_sessions"');
    expect(sql).toContain('"user_activity_sessions_user_started_idx"');
    expect(sql).toContain('"user_activity_sessions_last_seen_idx"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "user_activity_sessions_open_source_unique"');
    expect(sql).toContain('WHERE "source_session_id" IS NOT NULL AND "ended_at" IS NULL');
  });

  it("never persists forbidden request or credential material", () => {
    expect(sql).not.toMatch(/ip_address|user_agent|access_token|refresh_token|cookie|raw_session/i);
  });
});
