-- Add deletedByUserId column to chat_messages for audit trail
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "deleted_by_user_id" varchar;

-- Add FK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_messages_deleted_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_deleted_by_user_id_users_id_fk"
      FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

-- Create chat_message_reactions table
CREATE TABLE IF NOT EXISTS "chat_message_reactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL,
  "message_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "emoji" varchar(32) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chat_message_reactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "chat_message_reactions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "chat_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- Unique constraint: one reaction per user per emoji per message
CREATE UNIQUE INDEX IF NOT EXISTS "chat_message_reactions_unique" ON "chat_message_reactions" ("message_id", "user_id", "emoji");

-- Index for querying reactions by tenant and message
CREATE INDEX IF NOT EXISTS "chat_message_reactions_tenant_message_idx" ON "chat_message_reactions" ("tenant_id", "message_id");
