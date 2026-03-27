DO $$ BEGIN
  ALTER TABLE "time_entries" ADD COLUMN "subtask_id" varchar;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_subtask_id_subtasks_id_fk" FOREIGN KEY ("subtask_id") REFERENCES "public"."subtasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_subtask_idx" ON "time_entries" USING btree ("subtask_id");