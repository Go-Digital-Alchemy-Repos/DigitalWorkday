CREATE TABLE IF NOT EXISTS "division_project_conversions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" varchar NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "division_id" varchar NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "division_name" text NOT NULL,
  "division_snapshot" jsonb NOT NULL,
  "converted_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "division_project_conversions_division_unique"
  ON "division_project_conversions" ("division_id");
CREATE UNIQUE INDEX IF NOT EXISTS "division_project_conversions_project_unique"
  ON "division_project_conversions" ("project_id");
CREATE INDEX IF NOT EXISTS "division_project_conversions_tenant_idx"
  ON "division_project_conversions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "division_project_conversions_client_idx"
  ON "division_project_conversions" ("client_id");
