CREATE TABLE IF NOT EXISTS "chat_thread_reads" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "parent_message_id" varchar NOT NULL REFERENCES "chat_messages"("id"),
  "last_read_reply_id" varchar REFERENCES "chat_messages"("id"),
  "last_read_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_thread_reads_tenant_idx" ON "chat_thread_reads" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_thread_reads_user_idx" ON "chat_thread_reads" ("user_id");
CREATE INDEX IF NOT EXISTS "chat_thread_reads_parent_idx" ON "chat_thread_reads" ("parent_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "chat_thread_reads_user_parent_unique" ON "chat_thread_reads" ("user_id", "parent_message_id");
