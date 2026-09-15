ALTER TABLE "client_invites"
  ADD COLUMN IF NOT EXISTS "invitation_id" varchar;

UPDATE "client_invites" AS ci
SET "invitation_id" = i."id"
FROM "invitations" AS i
WHERE ci."invitation_id" IS NULL
  AND ci."token_placeholder" IS NOT NULL
  AND i."token_hash" = ci."token_placeholder"
  AND i."client_id" = ci."client_id";

CREATE UNIQUE INDEX IF NOT EXISTS "client_invites_invitation_unique"
  ON "client_invites" ("invitation_id");

DO $$ BEGIN
  ALTER TABLE "client_invites"
    ADD CONSTRAINT "client_invites_invitation_id_invitations_id_fk"
    FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "client_user_access"
  ADD COLUMN IF NOT EXISTS "project_scope" text NOT NULL DEFAULT 'all_visible';

CREATE TABLE IF NOT EXISTS "client_user_project_access" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" varchar NOT NULL REFERENCES "workspaces"("id"),
  "client_id" varchar NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_user_project_access_unique"
  ON "client_user_project_access" ("user_id", "project_id");

CREATE INDEX IF NOT EXISTS "client_user_project_access_user_client_idx"
  ON "client_user_project_access" ("user_id", "client_id");
