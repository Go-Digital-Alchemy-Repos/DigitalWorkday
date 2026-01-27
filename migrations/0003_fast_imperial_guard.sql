CREATE TABLE "client_document_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"category_id" varchar,
	"uploaded_by_user_id" varchar NOT NULL,
	"original_file_name" text NOT NULL,
	"display_name" text,
	"description" text,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"is_client_uploaded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_note_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"note_id" varchar NOT NULL,
	"uploaded_by_user_id" varchar NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_note_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_note_versions" (
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
CREATE TABLE "client_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"author_user_id" varchar NOT NULL,
	"last_edited_by_user_id" varchar,
	"body" jsonb NOT NULL,
	"category_id" varchar,
	"category" text DEFAULT 'general',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtask_assignees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"subtask_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtask_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtask_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "company_size" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "founded_date" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "primary_contact_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "primary_contact_email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "primary_contact_phone" text;--> statement-breakpoint
ALTER TABLE "subtasks" ADD COLUMN "description" jsonb;--> statement-breakpoint
ALTER TABLE "subtasks" ADD COLUMN "status" text DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "subtasks" ADD COLUMN "priority" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "subtasks" ADD COLUMN "estimate_minutes" integer;--> statement-breakpoint
ALTER TABLE "client_document_categories" ADD CONSTRAINT "client_document_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_document_categories" ADD CONSTRAINT "client_document_categories_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_category_id_client_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."client_document_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_attachments" ADD CONSTRAINT "client_note_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_attachments" ADD CONSTRAINT "client_note_attachments_note_id_client_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."client_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_attachments" ADD CONSTRAINT "client_note_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_categories" ADD CONSTRAINT "client_note_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_versions" ADD CONSTRAINT "client_note_versions_note_id_client_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."client_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_versions" ADD CONSTRAINT "client_note_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_versions" ADD CONSTRAINT "client_note_versions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_note_versions" ADD CONSTRAINT "client_note_versions_category_id_client_note_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."client_note_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_last_edited_by_user_id_users_id_fk" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_category_id_client_note_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."client_note_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtask_assignees" ADD CONSTRAINT "subtask_assignees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtask_assignees" ADD CONSTRAINT "subtask_assignees_subtask_id_subtasks_id_fk" FOREIGN KEY ("subtask_id") REFERENCES "public"."subtasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtask_assignees" ADD CONSTRAINT "subtask_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtask_tags" ADD CONSTRAINT "subtask_tags_subtask_id_subtasks_id_fk" FOREIGN KEY ("subtask_id") REFERENCES "public"."subtasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtask_tags" ADD CONSTRAINT "subtask_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_doc_categories_tenant_idx" ON "client_document_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_doc_categories_client_idx" ON "client_document_categories" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_doc_categories_name_client_idx" ON "client_document_categories" USING btree ("client_id","name");--> statement-breakpoint
CREATE INDEX "client_documents_tenant_idx" ON "client_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_documents_client_idx" ON "client_documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_documents_category_idx" ON "client_documents" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "client_documents_created_at_idx" ON "client_documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "client_note_attachments_note_idx" ON "client_note_attachments" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "client_note_attachments_tenant_idx" ON "client_note_attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_note_categories_tenant_idx" ON "client_note_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_note_categories_name_tenant_idx" ON "client_note_categories" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "client_note_versions_note_idx" ON "client_note_versions" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "client_note_versions_tenant_idx" ON "client_note_versions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_note_versions_created_at_idx" ON "client_note_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "client_notes_tenant_idx" ON "client_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_notes_client_idx" ON "client_notes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_notes_created_at_idx" ON "client_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "client_notes_category_idx" ON "client_notes" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subtask_assignees_unique" ON "subtask_assignees" USING btree ("subtask_id","user_id");--> statement-breakpoint
CREATE INDEX "subtask_assignees_user" ON "subtask_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subtask_assignees_tenant_idx" ON "subtask_assignees" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subtask_tags_unique" ON "subtask_tags" USING btree ("subtask_id","tag_id");--> statement-breakpoint
CREATE INDEX "subtask_tags_tag" ON "subtask_tags" USING btree ("tag_id");