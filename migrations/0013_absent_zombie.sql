CREATE TABLE "client_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"uploaded_by_user_id" varchar NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"size" integer,
	"storage_key" text NOT NULL,
	"url" text,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"linked_entity_type" text,
	"linked_entity_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_client_access" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_files_tenant_idx" ON "client_files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_files_client_idx" ON "client_files" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_files_visibility_idx" ON "client_files" USING btree ("client_id","visibility");--> statement-breakpoint
CREATE INDEX "user_client_access_user_idx" ON "user_client_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_client_access_client_idx" ON "user_client_access" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_client_access_unique_idx" ON "user_client_access" USING btree ("user_id","client_id");