CREATE TABLE "tenant_note_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"editor_user_id" varchar NOT NULL,
	"body" text NOT NULL,
	"category" text DEFAULT 'general',
	"version_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_timers" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "ai_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "ai_provider" text DEFAULT 'openai';--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "ai_model" text DEFAULT 'gpt-4o-mini';--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "ai_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "ai_max_tokens" integer DEFAULT 2000;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "ai_temperature" text DEFAULT '0.7';--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "ai_last_tested_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenant_notes" ADD COLUMN "last_edited_by_user_id" varchar;--> statement-breakpoint
ALTER TABLE "tenant_notes" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "tenant_note_versions" ADD CONSTRAINT "tenant_note_versions_note_id_tenant_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."tenant_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_note_versions" ADD CONSTRAINT "tenant_note_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_note_versions_note_idx" ON "tenant_note_versions" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "tenant_note_versions_tenant_idx" ON "tenant_note_versions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_note_versions_created_at_idx" ON "tenant_note_versions" USING btree ("created_at");