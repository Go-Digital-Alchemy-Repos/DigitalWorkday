ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "target_portal_user_id" varchar REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "approval_requests_target_portal_user_idx"
  ON "approval_requests" ("target_portal_user_id");
