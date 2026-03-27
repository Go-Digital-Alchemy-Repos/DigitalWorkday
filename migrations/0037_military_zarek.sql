CREATE TABLE "client_stage_automation_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"rule_id" varchar,
	"rule_name" text,
	"client_id" varchar,
	"project_id" varchar,
	"trigger_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"outcome" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_stage_automation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb,
	"condition_config" jsonb DEFAULT '{}'::jsonb,
	"to_stage" text NOT NULL,
	"allow_backward" boolean DEFAULT false NOT NULL,
	"allow_skip_stages" boolean DEFAULT true NOT NULL,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_stage_automation_events" ADD CONSTRAINT "client_stage_automation_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stage_automation_events" ADD CONSTRAINT "client_stage_automation_events_rule_id_client_stage_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."client_stage_automation_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stage_automation_events" ADD CONSTRAINT "client_stage_automation_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stage_automation_rules" ADD CONSTRAINT "client_stage_automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stage_automation_rules" ADD CONSTRAINT "client_stage_automation_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stage_automation_rules" ADD CONSTRAINT "client_stage_automation_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_events_tenant_idx" ON "client_stage_automation_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "automation_events_rule_idx" ON "client_stage_automation_events" USING btree ("tenant_id","rule_id");--> statement-breakpoint
CREATE INDEX "automation_events_created_at_idx" ON "client_stage_automation_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_rules_tenant_enabled_idx" ON "client_stage_automation_rules" USING btree ("tenant_id","is_enabled");--> statement-breakpoint
CREATE INDEX "automation_rules_tenant_workspace_idx" ON "client_stage_automation_rules" USING btree ("tenant_id","workspace_id","is_enabled");