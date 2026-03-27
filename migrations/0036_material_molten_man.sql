CREATE TABLE "client_stage_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"client_id" varchar NOT NULL,
	"from_stage" text NOT NULL,
	"to_stage" text NOT NULL,
	"changed_by_user_id" varchar,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "stage" text DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_stage_history" ADD CONSTRAINT "client_stage_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stage_history" ADD CONSTRAINT "client_stage_history_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stage_history" ADD CONSTRAINT "client_stage_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_stage_history_tenant_idx" ON "client_stage_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_stage_history_client_idx" ON "client_stage_history" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "client_stage_history_changed_at_idx" ON "client_stage_history" USING btree ("tenant_id","client_id","changed_at");--> statement-breakpoint
CREATE INDEX "clients_stage_idx" ON "clients" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "clients_tenant_stage_idx" ON "clients" USING btree ("tenant_id","stage");