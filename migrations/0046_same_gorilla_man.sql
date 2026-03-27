CREATE TABLE "quickbooks_customer_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"quickbooks_customer_id" text,
	"quickbooks_display_name" text,
	"mapping_status" text DEFAULT 'unmapped' NOT NULL,
	"mapping_method" text,
	"mapping_confidence" numeric,
	"is_locked" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp,
	"last_sync_status" text,
	"last_sync_error" text,
	"created_by_user_id" varchar,
	"updated_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quickbooks_sync_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"entity_type" text DEFAULT 'client_mapping' NOT NULL,
	"client_id" varchar,
	"mapping_id" varchar,
	"quickbooks_customer_id" text,
	"action" text NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"message" text,
	"payload_json" jsonb,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickbooks_customer_mappings" ADD CONSTRAINT "quickbooks_customer_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_customer_mappings" ADD CONSTRAINT "quickbooks_customer_mappings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_customer_mappings" ADD CONSTRAINT "quickbooks_customer_mappings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_customer_mappings" ADD CONSTRAINT "quickbooks_customer_mappings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_sync_logs" ADD CONSTRAINT "quickbooks_sync_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_sync_logs" ADD CONSTRAINT "quickbooks_sync_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_sync_logs" ADD CONSTRAINT "quickbooks_sync_logs_mapping_id_quickbooks_customer_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."quickbooks_customer_mappings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_sync_logs" ADD CONSTRAINT "quickbooks_sync_logs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qb_mappings_tenant_client_unique" ON "quickbooks_customer_mappings" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qb_mappings_tenant_qb_customer_unique" ON "quickbooks_customer_mappings" USING btree ("tenant_id","quickbooks_customer_id");--> statement-breakpoint
CREATE INDEX "qb_mappings_tenant_status_idx" ON "quickbooks_customer_mappings" USING btree ("tenant_id","mapping_status");--> statement-breakpoint
CREATE INDEX "qb_mappings_tenant_display_name_idx" ON "quickbooks_customer_mappings" USING btree ("tenant_id","quickbooks_display_name");--> statement-breakpoint
CREATE INDEX "qb_mappings_tenant_synced_idx" ON "quickbooks_customer_mappings" USING btree ("tenant_id","last_synced_at");--> statement-breakpoint
CREATE INDEX "qb_sync_logs_tenant_idx" ON "quickbooks_sync_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "qb_sync_logs_client_idx" ON "quickbooks_sync_logs" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "qb_sync_logs_mapping_idx" ON "quickbooks_sync_logs" USING btree ("mapping_id");