CREATE TABLE "support_sla_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"category" text,
	"priority" text NOT NULL,
	"first_response_minutes" integer NOT NULL,
	"resolution_minutes" integer NOT NULL,
	"escalation_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_form_schemas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"category" text NOT NULL,
	"schema_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "first_response_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "first_response_breached_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "resolution_breached_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "metadata_json" jsonb;--> statement-breakpoint
ALTER TABLE "support_sla_policies" ADD CONSTRAINT "support_sla_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sla_policies" ADD CONSTRAINT "support_sla_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_form_schemas" ADD CONSTRAINT "support_ticket_form_schemas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_form_schemas" ADD CONSTRAINT "support_ticket_form_schemas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_sla_policies_tenant_ws_cat_pri_idx" ON "support_sla_policies" USING btree ("tenant_id","workspace_id","category","priority");--> statement-breakpoint
CREATE INDEX "support_sla_policies_tenant_idx" ON "support_sla_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_ticket_form_schemas_tenant_ws_cat_idx" ON "support_ticket_form_schemas" USING btree ("tenant_id","workspace_id","category");--> statement-breakpoint
CREATE INDEX "support_ticket_form_schemas_tenant_idx" ON "support_ticket_form_schemas" USING btree ("tenant_id");