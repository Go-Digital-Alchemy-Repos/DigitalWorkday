CREATE INDEX IF NOT EXISTS "notifications_user_dismissed_created_idx"
  ON "notifications" ("user_id", "is_dismissed", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_user_dismissed_read_created_idx"
  ON "notifications" ("user_id", "is_dismissed", "read_at", "created_at");

CREATE INDEX IF NOT EXISTS "client_conversations_tenant_client_updated_idx"
  ON "client_conversations" ("tenant_id", "client_id", "updated_at");

CREATE INDEX IF NOT EXISTS "client_conversations_tenant_updated_idx"
  ON "client_conversations" ("tenant_id", "updated_at");

CREATE INDEX IF NOT EXISTS "client_messages_conversation_created_idx"
  ON "client_messages" ("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "support_tickets_tenant_last_activity_idx"
  ON "support_tickets" ("tenant_id", "last_activity_at");

CREATE INDEX IF NOT EXISTS "support_tickets_tenant_client_last_activity_idx"
  ON "support_tickets" ("tenant_id", "client_id", "last_activity_at");
