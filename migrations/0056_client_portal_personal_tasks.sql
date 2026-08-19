ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "client_id" varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_client_id_clients_id_fk'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_client_id_clients_id_fk"
      FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
      ON DELETE CASCADE ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tasks_client_personal_creator_idx"
  ON "tasks" ("client_id", "is_personal", "created_by");
