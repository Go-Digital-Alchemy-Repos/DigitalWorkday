-- Add type column to client_conversations
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "type" varchar(30) DEFAULT 'everyday' NOT NULL;

-- Create index for type filtering
CREATE INDEX IF NOT EXISTS "client_conversations_type_idx" ON "client_conversations" ("tenant_id", "client_id", "type");

-- Create read-tracking table
CREATE TABLE IF NOT EXISTS "client_conversation_reads" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "conversation_id" varchar NOT NULL REFERENCES "client_conversations"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "last_read_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ccr_tenant_user_convo_idx" ON "client_conversation_reads" ("tenant_id", "user_id", "conversation_id");
CREATE INDEX IF NOT EXISTS "ccr_conversation_idx" ON "client_conversation_reads" ("conversation_id");

-- GIN indexes for full-text search on conversation subject and message body
CREATE INDEX IF NOT EXISTS "client_conversations_subject_fts_idx" ON "client_conversations" USING GIN (to_tsvector('english', "subject"));
CREATE INDEX IF NOT EXISTS "client_messages_body_fts_idx" ON "client_messages" USING GIN (to_tsvector('english', "body_text"));
