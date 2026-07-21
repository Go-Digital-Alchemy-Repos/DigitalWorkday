CREATE TABLE IF NOT EXISTS "user_client_access" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL,
  "workspace_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "client_id" varchar NOT NULL,
  "access_level" text DEFAULT 'viewer' NOT NULL,
  "permissions" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "user_client_access"
  ADD COLUMN IF NOT EXISTS "tenant_id" varchar;

ALTER TABLE "user_client_access"
  ADD COLUMN IF NOT EXISTS "workspace_id" varchar;

ALTER TABLE "user_client_access"
  ADD COLUMN IF NOT EXISTS "user_id" varchar;

ALTER TABLE "user_client_access"
  ADD COLUMN IF NOT EXISTS "client_id" varchar;

ALTER TABLE "user_client_access"
  ADD COLUMN IF NOT EXISTS "access_level" text DEFAULT 'viewer' NOT NULL;

ALTER TABLE "user_client_access"
  ADD COLUMN IF NOT EXISTS "permissions" jsonb;

ALTER TABLE "user_client_access"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "user_client_access"
  ALTER COLUMN "access_level" SET DEFAULT 'viewer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_client_access_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "user_client_access"
      ADD CONSTRAINT "user_client_access_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_client_access_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "user_client_access"
      ADD CONSTRAINT "user_client_access_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_client_access_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "user_client_access"
      ADD CONSTRAINT "user_client_access_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_client_access_client_id_clients_id_fk'
  ) THEN
    ALTER TABLE "user_client_access"
      ADD CONSTRAINT "user_client_access_client_id_clients_id_fk"
      FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_client_access_workspace_idx"
  ON "user_client_access" ("workspace_id");

CREATE INDEX IF NOT EXISTS "user_client_access_user_idx"
  ON "user_client_access" ("user_id");

CREATE INDEX IF NOT EXISTS "user_client_access_client_idx"
  ON "user_client_access" ("client_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_client_access_unique_idx"
  ON "user_client_access" ("user_id", "client_id");
