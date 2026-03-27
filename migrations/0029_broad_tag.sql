CREATE TABLE "client_message_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"default_metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_message_templates" ADD CONSTRAINT "client_message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_msg_templates_tenant_idx" ON "client_message_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_msg_templates_active_idx" ON "client_message_templates" USING btree ("tenant_id","is_active");