ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "can_view_finance" boolean NOT NULL DEFAULT false;
