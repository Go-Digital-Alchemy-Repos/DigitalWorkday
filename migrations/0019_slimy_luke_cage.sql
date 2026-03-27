CREATE TABLE IF NOT EXISTS "client_document_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"name" text NOT NULL,
	"parent_folder_id" varchar,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_note_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_note_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"editor_user_id" varchar NOT NULL,
	"body" jsonb NOT NULL,
	"category" text,
	"category_id" varchar,
	"version_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"author_user_id" varchar NOT NULL,
	"last_edited_by_user_id" varchar,
	"body" jsonb NOT NULL,
	"category_id" varchar,
	"category" text DEFAULT 'general',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_documents' AND column_name = 'folder_id') THEN
    ALTER TABLE "client_documents" ADD COLUMN "folder_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'sticky_at') THEN
    ALTER TABLE "projects" ADD COLUMN "sticky_at" timestamp;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_document_folders" ADD CONSTRAINT "client_document_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_document_folders" ADD CONSTRAINT "client_document_folders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_document_folders" ADD CONSTRAINT "client_document_folders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_note_categories" ADD CONSTRAINT "project_note_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_note_versions" ADD CONSTRAINT "project_note_versions_note_id_project_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."project_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_note_versions" ADD CONSTRAINT "project_note_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_note_versions" ADD CONSTRAINT "project_note_versions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_note_versions" ADD CONSTRAINT "project_note_versions_category_id_project_note_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."project_note_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_last_edited_by_user_id_users_id_fk" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_category_id_project_note_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."project_note_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_doc_folders_tenant_idx" ON "client_document_folders" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_doc_folders_client_idx" ON "client_document_folders" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_doc_folders_parent_idx" ON "client_document_folders" USING btree ("parent_folder_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_doc_folders_unique_name_idx" ON "client_document_folders" USING btree ("tenant_id","client_id","parent_folder_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_note_categories_tenant_idx" ON "project_note_categories" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_note_categories_name_tenant_idx" ON "project_note_categories" USING btree ("tenant_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_note_versions_note_idx" ON "project_note_versions" USING btree ("note_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_note_versions_tenant_idx" ON "project_note_versions" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_note_versions_created_at_idx" ON "project_note_versions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_notes_tenant_idx" ON "project_notes" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_notes_project_idx" ON "project_notes" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_notes_created_at_idx" ON "project_notes" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_notes_category_idx" ON "project_notes" USING btree ("category_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_folder_id_client_document_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."client_document_folders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_documents_folder_idx" ON "client_documents" USING btree ("folder_id");
