ALTER TABLE "client_messages"
  ADD COLUMN IF NOT EXISTS "attachments_json" jsonb;

ALTER TABLE "support_ticket_messages"
  ADD COLUMN IF NOT EXISTS "attachments_json" jsonb;
