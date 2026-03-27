CREATE TABLE IF NOT EXISTS "chat_export_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_user_id" varchar NOT NULL,
	"scope_type" varchar(20) NOT NULL,
	"tenant_id" varchar,
	"cutoff_type" varchar(20) NOT NULL,
	"cutoff_date" timestamp,
	"retain_days" integer,
	"include_attachment_files" boolean DEFAULT false NOT NULL,
	"format" varchar(10) DEFAULT 'jsonl' NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"output_location" jsonb,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general',
	"is_default" boolean DEFAULT false,
	"content" jsonb NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comments" ALTER COLUMN "task_id" DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD COLUMN "parent_message_id" varchar;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comments" ADD COLUMN "subtask_id" varchar;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_export_jobs" ADD CONSTRAINT "chat_export_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_export_jobs" ADD CONSTRAINT "chat_export_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_export_jobs_user_idx" ON "chat_export_jobs" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_export_jobs_tenant_idx" ON "chat_export_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_export_jobs_status_idx" ON "chat_export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_export_jobs_created_idx" ON "chat_export_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_templates_tenant_idx" ON "project_templates" USING btree ("tenant_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comments" ADD CONSTRAINT "comments_subtask_id_subtasks_id_fk" FOREIGN KEY ("subtask_id") REFERENCES "public"."subtasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_parent_idx" ON "chat_messages" USING btree ("parent_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_subtask_created" ON "comments" USING btree ("subtask_id","created_at");