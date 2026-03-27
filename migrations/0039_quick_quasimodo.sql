CREATE TABLE "control_center_widget_layouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"created_by_user_id" varchar,
	"updated_by_user_id" varchar,
	"layout_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "chat_message" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "client_message" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "support_ticket" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "work_order" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "severity" text DEFAULT 'info' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "entity_type" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "href" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "event_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_event_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "group_meta" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "is_dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control_center_widget_layouts" ADD CONSTRAINT "control_center_widget_layouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_center_widget_layouts" ADD CONSTRAINT "control_center_widget_layouts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_center_widget_layouts" ADD CONSTRAINT "control_center_widget_layouts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cc_widget_layouts_tenant_idx" ON "control_center_widget_layouts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cc_widget_layouts_tenant_ws_uniq" ON "control_center_widget_layouts" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("tenant_id","user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_group_lookup_idx" ON "notifications" USING btree ("tenant_id","user_id","dedupe_key","is_dismissed");