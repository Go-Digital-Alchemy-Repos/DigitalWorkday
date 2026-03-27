CREATE TABLE "asset_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"client_id" varchar NOT NULL,
	"parent_folder_id" varchar,
	"name" text NOT NULL,
	"path" text,
	"sort_order" integer,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"asset_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"client_id" varchar NOT NULL,
	"folder_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"r2_key" text NOT NULL,
	"checksum" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_id" varchar,
	"source_context_json" jsonb,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"uploaded_by_type" text DEFAULT 'tenant_user' NOT NULL,
	"uploaded_by_user_id" varchar,
	"uploaded_by_portal_user_id" varchar,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_folder_id_asset_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."asset_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_folders_tenant_client_parent_idx" ON "asset_folders" USING btree ("tenant_id","client_id","parent_folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_folders_unique_name_idx" ON "asset_folders" USING btree ("tenant_id","client_id","parent_folder_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_links_unique_idx" ON "asset_links" USING btree ("entity_type","entity_id","asset_id");--> statement-breakpoint
CREATE INDEX "asset_links_asset_idx" ON "asset_links" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_links_entity_idx" ON "asset_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "assets_tenant_client_created_idx" ON "assets" USING btree ("tenant_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_tenant_client_folder_idx" ON "assets" USING btree ("tenant_id","client_id","folder_id");--> statement-breakpoint
CREATE INDEX "assets_tenant_client_source_idx" ON "assets" USING btree ("tenant_id","client_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_tenant_r2key_idx" ON "assets" USING btree ("tenant_id","r2_key");