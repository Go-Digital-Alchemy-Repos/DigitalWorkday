ALTER TABLE "finance_website_assignments"
  ADD COLUMN IF NOT EXISTS "evidence_source" text;

ALTER TABLE "finance_website_assignments"
  ADD COLUMN IF NOT EXISTS "evidence_details" text;
