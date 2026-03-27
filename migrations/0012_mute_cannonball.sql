CREATE TABLE "client_crm" (
	"client_id" varchar PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"status" text DEFAULT 'active',
	"owner_user_id" varchar,
	"tags" text[],
	"last_contact_at" timestamp,
	"next_follow_up_at" timestamp,
	"follow_up_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "tenant_id" varchar;--> statement-breakpoint
ALTER TABLE "client_crm" ADD CONSTRAINT "client_crm_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_crm" ADD CONSTRAINT "client_crm_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_crm" ADD CONSTRAINT "client_crm_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_crm_tenant_status_idx" ON "client_crm" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "client_crm_tenant_followup_idx" ON "client_crm" USING btree ("tenant_id","next_follow_up_at");--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contacts_tenant_client_idx" ON "client_contacts" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "client_contacts_tenant_email_idx" ON "client_contacts" USING btree ("tenant_id","email");