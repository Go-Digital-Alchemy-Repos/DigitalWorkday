CREATE TABLE "conversation_sla_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"priority" varchar(20) NOT NULL,
	"first_response_minutes" integer NOT NULL,
	"resolution_minutes" integer NOT NULL,
	"escalation_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_conversations" ADD COLUMN "priority" varchar(20) DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD COLUMN "first_response_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD COLUMN "first_response_breached_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD COLUMN "resolution_breached_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "message_permissions" jsonb;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "default_conversation_assignee_id" varchar;--> statement-breakpoint
ALTER TABLE "conversation_sla_policies" ADD CONSTRAINT "conversation_sla_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_sla_policies_tenant_pri_idx" ON "conversation_sla_policies" USING btree ("tenant_id","priority");--> statement-breakpoint
CREATE INDEX "conversation_sla_policies_tenant_idx" ON "conversation_sla_policies" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_default_conversation_assignee_id_users_id_fk" FOREIGN KEY ("default_conversation_assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_conversations_sla_check_idx" ON "client_conversations" USING btree ("tenant_id","closed_at","first_response_at");