CREATE TABLE "tenant_default_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"folder_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"r2_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_year" integer,
	"created_by_user_id" varchar,
	"updated_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_default_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"parent_folder_id" varchar,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_default_documents" ADD CONSTRAINT "tenant_default_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_default_documents" ADD CONSTRAINT "tenant_default_documents_folder_id_tenant_default_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."tenant_default_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_default_documents" ADD CONSTRAINT "tenant_default_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_default_documents" ADD CONSTRAINT "tenant_default_documents_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_default_folders" ADD CONSTRAINT "tenant_default_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_default_folders" ADD CONSTRAINT "tenant_default_folders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tdd_tenant_folder_idx" ON "tenant_default_documents" USING btree ("tenant_id","folder_id");--> statement-breakpoint
CREATE INDEX "tdd_tenant_deleted_idx" ON "tenant_default_documents" USING btree ("tenant_id","is_deleted");--> statement-breakpoint
CREATE INDEX "tdd_tenant_updated_idx" ON "tenant_default_documents" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "tdf_tenant_parent_idx" ON "tenant_default_folders" USING btree ("tenant_id","parent_folder_id");--> statement-breakpoint
CREATE INDEX "tdf_tenant_idx" ON "tenant_default_folders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tdf_tenant_deleted_idx" ON "tenant_default_folders" USING btree ("tenant_id","is_deleted");