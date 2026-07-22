ALTER TABLE "workspace_members"
  ADD COLUMN IF NOT EXISTS "weekly_capacity_minutes" integer NOT NULL DEFAULT 2400;

CREATE TABLE IF NOT EXISTS "member_capacity_exceptions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "capacity_date" date NOT NULL,
  "available_minutes" integer NOT NULL DEFAULT 0,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "member_capacity_exception_unique"
  ON "member_capacity_exceptions" ("tenant_id", "user_id", "capacity_date");
CREATE INDEX IF NOT EXISTS "member_capacity_exception_tenant_date_idx"
  ON "member_capacity_exceptions" ("tenant_id", "capacity_date");

CREATE TABLE IF NOT EXISTS "report_saved_views" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "workspace" text NOT NULL,
  "name" text NOT NULL,
  "query" text NOT NULL DEFAULT '',
  "is_shared" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "report_saved_views_owner_name_unique"
  ON "report_saved_views" ("tenant_id", "user_id", "workspace", "name");
CREATE INDEX IF NOT EXISTS "report_saved_views_tenant_workspace_idx"
  ON "report_saved_views" ("tenant_id", "workspace");

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp;

UPDATE "tasks"
SET "completed_at" = "updated_at"
WHERE "status" = 'done' AND "completed_at" IS NULL;

CREATE TABLE IF NOT EXISTS "task_status_history" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "task_id" varchar NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_by" varchar REFERENCES "users"("id"),
  "changed_at" timestamp NOT NULL DEFAULT now(),
  "is_approximate" boolean NOT NULL DEFAULT false
);

ALTER TABLE "task_status_history"
  ADD COLUMN IF NOT EXISTS "is_approximate" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "task_status_history_tenant_changed_idx"
  ON "task_status_history" ("tenant_id", "changed_at");
CREATE INDEX IF NOT EXISTS "task_status_history_task_changed_idx"
  ON "task_status_history" ("task_id", "changed_at");

INSERT INTO "task_status_history" ("tenant_id", "task_id", "from_status", "to_status", "changed_at", "is_approximate")
SELECT "tenant_id", "id", NULL, "status", COALESCE("completed_at", "created_at"), true
FROM "tasks" t
WHERE t."tenant_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "task_status_history" h WHERE h."task_id" = t."id"
  );

CREATE OR REPLACE FUNCTION record_task_reporting_status_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSIF OLD.status = 'done' THEN
      NEW.completed_at := NULL;
    END IF;

    IF NEW.tenant_id IS NOT NULL THEN
      INSERT INTO task_status_history (tenant_id, task_id, from_status, to_status, changed_at)
      VALUES (NEW.tenant_id, NEW.id, OLD.status, NEW.status, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_reporting_status_change ON "tasks";
CREATE TRIGGER tasks_reporting_status_change
BEFORE UPDATE OF "status" ON "tasks"
FOR EACH ROW EXECUTE FUNCTION record_task_reporting_status_change();
