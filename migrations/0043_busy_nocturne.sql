CREATE TABLE IF NOT EXISTS "ai_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"entity_type" text DEFAULT 'employee' NOT NULL,
	"entity_id" varchar NOT NULL,
	"viewer_scope" text DEFAULT 'tenant_admins' NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"input_hash" text NOT NULL,
	"model" text NOT NULL,
	"summary_version" text DEFAULT '1.0' NOT NULL,
	"headline" text,
	"summary_markdown" text,
	"bullets_json" jsonb,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"rule_id" varchar NOT NULL,
	"event_key" text NOT NULL,
	"entity_scope" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_id" varchar,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"delivered_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by_user_id" varchar,
	"acknowledged_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"rule_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"schedule" text DEFAULT 'daily' NOT NULL,
	"parameters_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_user_scope" text DEFAULT 'tenant_admins' NOT NULL,
	"target_user_ids" jsonb,
	"delivery_channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"throttle_minutes" integer DEFAULT 1440 NOT NULL,
	"last_run_at" timestamp,
	"created_by_user_id" varchar NOT NULL,
	"updated_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_retention_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"entity_type" text NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"archive_mode" text DEFAULT 'soft' NOT NULL,
	"created_by_user_id" varchar,
	"updated_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forecast_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"snapshot_type" text NOT NULL,
	"horizon_weeks" integer DEFAULT 4 NOT NULL,
	"as_of_date" timestamp NOT NULL,
	"range_start" timestamp NOT NULL,
	"range_end" timestamp NOT NULL,
	"entity_scope" text DEFAULT 'tenant' NOT NULL,
	"entity_id" varchar,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" text DEFAULT 'Medium' NOT NULL,
	"data_quality_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_draft_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_draft_id" varchar NOT NULL,
	"time_entry_id" varchar,
	"task_id" varchar,
	"description" text DEFAULT '' NOT NULL,
	"hours" numeric DEFAULT '0' NOT NULL,
	"rate" numeric DEFAULT '0' NOT NULL,
	"amount" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar,
	"project_id" varchar,
	"created_by_user_id" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_hours" numeric DEFAULT '0' NOT NULL,
	"total_amount" numeric DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_digest_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"day_of_week" integer DEFAULT 1 NOT NULL,
	"hour_local" integer DEFAULT 9 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"recipients_scope" text DEFAULT 'tenant_admins' NOT NULL,
	"recipient_user_ids" jsonb,
	"include_sections" jsonb DEFAULT '["top_overloads","projects_at_risk","clients_at_risk","team_throughput"]'::jsonb NOT NULL,
	"last_sent_at" timestamp,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_access" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"invited_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_milestones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"status" text DEFAULT 'not_started' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" varchar,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_risk_acknowledgments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"risk_level" text NOT NULL,
	"risk_score" numeric,
	"acknowledged_by_user_id" varchar,
	"acknowledged_at" timestamp DEFAULT now() NOT NULL,
	"mitigation_note" text,
	"next_check_in_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_status_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"generated_by_user_id" varchar,
	"summary_markdown" text DEFAULT '' NOT NULL,
	"sections_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_access" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"task_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"invited_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"actor_user_id" varchar,
	"action_type" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "task_deadline_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "task_assigned_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "task_completed_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "comment_added_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "comment_mention_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "project_update_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "project_member_added_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "task_status_changed_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "chat_message_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "client_message_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "support_ticket_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD COLUMN "work_order_email" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "projects" ADD COLUMN "project_manager_id" varchar; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "visibility" text DEFAULT 'workspace' NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "archived_reason" text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "needs_pm_review" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "pm_review_requested_at" timestamp; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "pm_review_requested_by" varchar; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "pm_review_resolved_at" timestamp; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "pm_review_resolved_by" varchar; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "pm_review_note" text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD COLUMN "milestone_id" varchar; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "time_entries" ADD COLUMN "billing_status" text DEFAULT 'draft' NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD COLUMN "is_project_manager" boolean DEFAULT false NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD COLUMN "cost_rate" numeric DEFAULT '0' NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD COLUMN "billable_rate" numeric DEFAULT '0' NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_snapshot_id_forecast_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."forecast_snapshots"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "invoice_draft_items" ADD CONSTRAINT "invoice_draft_items_invoice_draft_id_invoice_drafts_id_fk" FOREIGN KEY ("invoice_draft_id") REFERENCES "public"."invoice_drafts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "invoice_draft_items" ADD CONSTRAINT "invoice_draft_items_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "invoice_draft_items" ADD CONSTRAINT "invoice_draft_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ops_digest_schedules" ADD CONSTRAINT "ops_digest_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ops_digest_schedules" ADD CONSTRAINT "ops_digest_schedules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_access" ADD CONSTRAINT "project_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_access" ADD CONSTRAINT "project_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_access" ADD CONSTRAINT "project_access_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_risk_acknowledgments" ADD CONSTRAINT "project_risk_acknowledgments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_risk_acknowledgments" ADD CONSTRAINT "project_risk_acknowledgments_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_status_reports" ADD CONSTRAINT "project_status_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_status_reports" ADD CONSTRAINT "project_status_reports_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "task_access" ADD CONSTRAINT "task_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "task_access" ADD CONSTRAINT "task_access_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "task_access" ADD CONSTRAINT "task_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "task_access" ADD CONSTRAINT "task_access_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "task_history" ADD CONSTRAINT "task_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_summaries_entity_idx" ON "ai_summaries" USING btree ("tenant_id","entity_type","entity_id","range_start","range_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_summaries_tenant_created_idx" ON "ai_summaries" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_summaries_expires_idx" ON "ai_summaries" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_events_tenant_rule_triggered_idx" ON "alert_events" USING btree ("tenant_id","rule_id","triggered_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_events_tenant_scope_entity_idx" ON "alert_events" USING btree ("tenant_id","entity_scope","entity_id","triggered_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_events_tenant_event_key_idx" ON "alert_events" USING btree ("tenant_id","event_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_tenant_idx" ON "alert_rules" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_tenant_type_idx" ON "alert_rules" USING btree ("tenant_id","rule_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_tenant_enabled_idx" ON "alert_rules" USING btree ("tenant_id","is_enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_retention_policies_tenant_entity_idx" ON "data_retention_policies" USING btree ("tenant_id","entity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_retention_policies_entity_idx" ON "data_retention_policies" USING btree ("entity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forecast_snapshots_tenant_type_date_idx" ON "forecast_snapshots" USING btree ("tenant_id","snapshot_type","as_of_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forecast_snapshots_tenant_scope_entity_idx" ON "forecast_snapshots" USING btree ("tenant_id","entity_scope","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forecast_snapshots_tenant_created_idx" ON "forecast_snapshots" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_draft_items_draft_idx" ON "invoice_draft_items" USING btree ("invoice_draft_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_drafts_tenant_idx" ON "invoice_drafts" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_drafts_client_idx" ON "invoice_drafts" USING btree ("tenant_id","client_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ops_digest_schedules_tenant_idx" ON "ops_digest_schedules" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_access_unique" ON "project_access" USING btree ("tenant_id","project_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_access_project_idx" ON "project_access" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_access_user_idx" ON "project_access" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_access_tenant_project_idx" ON "project_access" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_milestones_tenant_project_idx" ON "project_milestones" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_milestones_project_status_idx" ON "project_milestones" USING btree ("project_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_ack_project_idx" ON "project_risk_acknowledgments" USING btree ("tenant_id","project_id","acknowledged_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_reports_project_idx" ON "project_status_reports" USING btree ("tenant_id","project_id","range_end");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_access_unique" ON "task_access" USING btree ("tenant_id","task_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_access_task_idx" ON "task_access" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_access_user_idx" ON "task_access" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_access_tenant_task_idx" ON "task_access" USING btree ("tenant_id","task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_history_entity_idx" ON "task_history" USING btree ("tenant_id","entity_type","entity_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_history_tenant_created_idx" ON "task_history" USING btree ("tenant_id","created_at");
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_users_id_fk" FOREIGN KEY ("project_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pm_review_requested_by_users_id_fk" FOREIGN KEY ("pm_review_requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pm_review_resolved_by_users_id_fk" FOREIGN KEY ("pm_review_resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_visibility_idx" ON "tasks" USING btree ("tenant_id","visibility");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_archived_idx" ON "tasks" USING btree ("tenant_id","archived_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_status_archived_idx" ON "tasks" USING btree ("tenant_id","status","archived_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_pm_review_idx" ON "tasks" USING btree ("tenant_id","needs_pm_review","pm_review_requested_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_pm_review_idx" ON "tasks" USING btree ("project_id","needs_pm_review");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_milestone_idx" ON "tasks" USING btree ("milestone_id");
