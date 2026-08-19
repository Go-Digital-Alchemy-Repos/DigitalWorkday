ALTER TABLE "client_user_access"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "suspended_at" timestamp,
  ADD COLUMN IF NOT EXISTS "suspended_by_user_id" varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_user_access_suspended_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "client_user_access"
      ADD CONSTRAINT "client_user_access_suspended_by_user_id_users_id_fk"
      FOREIGN KEY ("suspended_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE no action;
  END IF;
END $$;

-- Preserve explicit legacy portal memberships while making client_user_access the
-- only authorization source. Existing canonical assignments always win.
INSERT INTO "client_user_access" (
  "workspace_id",
  "client_id",
  "user_id",
  "access_level",
  "status",
  "created_at"
)
SELECT
  legacy."workspace_id",
  legacy."client_id",
  legacy."user_id",
  CASE
    WHEN legacy."access_level" = 'client_admin' THEN 'client_admin'
    ELSE 'collaborator'
  END,
  'active',
  legacy."created_at"
FROM "user_client_access" AS legacy
INNER JOIN "users" AS portal_user
  ON portal_user."id" = legacy."user_id"
  AND portal_user."role" = 'client'
  AND portal_user."is_active" = true
WHERE NOT EXISTS (
  SELECT 1
  FROM "client_user_access" AS canonical
  WHERE canonical."client_id" = legacy."client_id"
    AND canonical."user_id" = legacy."user_id"
);

UPDATE "client_user_access"
SET "access_level" = 'collaborator'
WHERE "access_level" = 'viewer';

ALTER TABLE "client_user_access"
  ALTER COLUMN "access_level" SET DEFAULT 'collaborator';

CREATE INDEX IF NOT EXISTS "client_user_access_active_user_idx"
  ON "client_user_access" ("user_id", "status");

ALTER TABLE "asset_folders"
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'internal';

UPDATE "asset_folders" AS folder
SET "visibility" = 'client_visible'
WHERE EXISTS (
  SELECT 1 FROM "assets" AS asset
  WHERE asset."folder_id" = folder."id"
    AND asset."visibility" = 'client_visible'
    AND asset."is_deleted" = false
);

WITH RECURSIVE visible_folder_tree AS (
  SELECT DISTINCT folder."id", folder."parent_folder_id"
  FROM "asset_folders" AS folder
  WHERE folder."visibility" = 'client_visible'
  UNION
  SELECT parent."id", parent."parent_folder_id"
  FROM "asset_folders" AS parent
  INNER JOIN visible_folder_tree AS child ON child."parent_folder_id" = parent."id"
)
UPDATE "asset_folders"
SET "visibility" = 'client_visible'
WHERE "id" IN (SELECT "id" FROM visible_folder_tree);

ALTER TABLE "client_invites"
  ALTER COLUMN "role_hint" SET DEFAULT 'collaborator';
