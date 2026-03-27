CREATE TABLE "background_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"progress" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"locked_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_address_line_1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_address_line_2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_state" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_postal_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_country" text;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bg_jobs_tenant_idx" ON "background_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bg_jobs_status_idx" ON "background_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bg_jobs_type_status_idx" ON "background_jobs" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "bg_jobs_created_at_idx" ON "background_jobs" USING btree ("created_at");