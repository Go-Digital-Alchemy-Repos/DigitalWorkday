ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'internal';

ALTER TABLE "comments"
  ALTER COLUMN "visibility" SET DEFAULT 'internal';

CREATE INDEX IF NOT EXISTS "comments_visibility_idx"
  ON "comments" ("visibility");

ALTER TABLE "client_invites"
  ADD COLUMN IF NOT EXISTS "access_client_ids" jsonb DEFAULT '[]'::jsonb;
