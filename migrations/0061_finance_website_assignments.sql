CREATE TABLE IF NOT EXISTS "finance_website_assignments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "wpe_install_id" varchar NOT NULL,
  "install_name" text,
  "primary_domain" text,
  "customer_name" text NOT NULL,
  "client_id" varchar REFERENCES "clients"("id"),
  "source" text NOT NULL DEFAULT 'manual',
  "notes" text,
  "assigned_by_user_id" varchar REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "finance_website_assignments_tenant_install_unique"
  ON "finance_website_assignments" ("tenant_id", "wpe_install_id");

CREATE INDEX IF NOT EXISTS "finance_website_assignments_tenant_customer_idx"
  ON "finance_website_assignments" ("tenant_id", "customer_name");
