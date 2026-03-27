CREATE TABLE "asana_import_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"actor_user_id" varchar NOT NULL,
	"asana_workspace_gid" text NOT NULL,
	"asana_workspace_name" text,
	"asana_project_gids" text[] NOT NULL,
	"target_workspace_id" varchar,
	"options" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"phase" text,
	"validation_summary" jsonb,
	"execution_summary" jsonb,
	"error_log" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_entity_map" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"entity_type" text NOT NULL,
	"provider_entity_id" text NOT NULL,
	"local_entity_id" varchar NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asana_import_runs" ADD CONSTRAINT "asana_import_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asana_import_runs" ADD CONSTRAINT "asana_import_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asana_import_runs" ADD CONSTRAINT "asana_import_runs_target_workspace_id_workspaces_id_fk" FOREIGN KEY ("target_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_entity_map" ADD CONSTRAINT "integration_entity_map_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asana_import_runs_tenant_idx" ON "asana_import_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "asana_import_runs_status_idx" ON "asana_import_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_entity_map_unique" ON "integration_entity_map" USING btree ("tenant_id","provider","entity_type","provider_entity_id");--> statement-breakpoint
CREATE INDEX "integration_entity_map_local_idx" ON "integration_entity_map" USING btree ("tenant_id","provider","entity_type","local_entity_id");--> statement-breakpoint
CREATE INDEX "integration_entity_map_tenant_idx" ON "integration_entity_map" USING btree ("tenant_id");