ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "archived_by" varchar REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "sections_project_active_order_idx"
  ON "sections" ("project_id", "archived_at", "order_index");
