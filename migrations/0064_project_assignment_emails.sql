ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "assignment_emails_enabled" boolean DEFAULT false NOT NULL;
