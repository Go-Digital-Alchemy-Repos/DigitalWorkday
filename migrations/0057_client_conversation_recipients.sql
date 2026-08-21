ALTER TABLE "client_conversations"
  ADD COLUMN IF NOT EXISTS "recipient_user_id" varchar,
  ADD COLUMN IF NOT EXISTS "portal_participant_user_ids" jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_conversations_recipient_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "client_conversations"
      ADD CONSTRAINT "client_conversations_recipient_user_id_users_id_fk"
      FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "client_conversations_recipient_idx"
  ON "client_conversations" ("recipient_user_id");

CREATE INDEX IF NOT EXISTS "client_conversations_portal_participants_idx"
  ON "client_conversations" USING gin ("portal_participant_user_ids");
