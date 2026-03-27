ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_division_id_client_divisions_id_fk";--> statement-breakpoint
UPDATE "projects" SET "division_id" = NULL WHERE "division_id" IS NOT NULL;--> statement-breakpoint
DROP TABLE IF EXISTS "division_members" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "client_divisions" CASCADE;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "division_id" CASCADE;
