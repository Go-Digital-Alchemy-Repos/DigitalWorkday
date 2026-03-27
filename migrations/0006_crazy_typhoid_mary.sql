DO $$ BEGIN
  ALTER TABLE "clients" ADD COLUMN "parent_client_id" varchar;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_parent_idx" ON "clients" USING btree ("parent_client_id");