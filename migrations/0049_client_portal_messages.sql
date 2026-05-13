CREATE TABLE IF NOT EXISTS "client_conversations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
  "client_id" varchar REFERENCES "clients"("id") NOT NULL,
  "project_id" varchar REFERENCES "projects"("id"),
  "subject" text NOT NULL,
  "type" varchar(30) DEFAULT 'everyday' NOT NULL,
  "priority" varchar(20) DEFAULT 'normal' NOT NULL,
  "created_by_user_id" varchar REFERENCES "users"("id") NOT NULL,
  "assigned_to_user_id" varchar REFERENCES "users"("id"),
  "closed_at" timestamp,
  "first_response_at" timestamp,
  "first_response_breached_at" timestamp,
  "resolution_breached_at" timestamp,
  "merged_into_id" varchar,
  "merged_at" timestamp,
  "merged_by_user_id" varchar REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "project_id" varchar REFERENCES "projects"("id");
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "type" varchar(30) DEFAULT 'everyday' NOT NULL;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "priority" varchar(20) DEFAULT 'normal' NOT NULL;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" varchar REFERENCES "users"("id");
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "first_response_at" timestamp;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "first_response_breached_at" timestamp;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "resolution_breached_at" timestamp;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "merged_into_id" varchar;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "merged_at" timestamp;
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "merged_by_user_id" varchar REFERENCES "users"("id");
ALTER TABLE "client_conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "client_conversations_tenant_idx" ON "client_conversations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "client_conversations_client_idx" ON "client_conversations" ("client_id");
CREATE INDEX IF NOT EXISTS "client_conversations_project_idx" ON "client_conversations" ("project_id");
CREATE INDEX IF NOT EXISTS "client_conversations_assigned_idx" ON "client_conversations" ("assigned_to_user_id");
CREATE INDEX IF NOT EXISTS "client_conversations_type_idx" ON "client_conversations" ("tenant_id", "client_id", "type");
CREATE INDEX IF NOT EXISTS "client_conversations_dup_detect_idx" ON "client_conversations" ("tenant_id", "client_id", "subject", "created_at");
CREATE INDEX IF NOT EXISTS "client_conversations_sla_check_idx" ON "client_conversations" ("tenant_id", "closed_at", "first_response_at");

CREATE TABLE IF NOT EXISTS "client_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
  "conversation_id" varchar REFERENCES "client_conversations"("id") ON DELETE cascade NOT NULL,
  "author_user_id" varchar REFERENCES "users"("id") NOT NULL,
  "body_text" text NOT NULL,
  "body_rich" text,
  "visibility" varchar(20) DEFAULT 'public' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "client_messages" ADD COLUMN IF NOT EXISTS "body_rich" text;
ALTER TABLE "client_messages" ADD COLUMN IF NOT EXISTS "visibility" varchar(20) DEFAULT 'public' NOT NULL;

CREATE INDEX IF NOT EXISTS "client_messages_tenant_idx" ON "client_messages" ("tenant_id");
CREATE INDEX IF NOT EXISTS "client_messages_conversation_idx" ON "client_messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "client_messages_created_idx" ON "client_messages" ("created_at");
CREATE INDEX IF NOT EXISTS "client_messages_visibility_idx" ON "client_messages" ("visibility");

CREATE TABLE IF NOT EXISTS "client_conversation_reads" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
  "conversation_id" varchar REFERENCES "client_conversations"("id") ON DELETE cascade NOT NULL,
  "user_id" varchar REFERENCES "users"("id") NOT NULL,
  "last_read_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ccr_tenant_user_convo_idx" ON "client_conversation_reads" ("tenant_id", "user_id", "conversation_id");
CREATE INDEX IF NOT EXISTS "ccr_conversation_idx" ON "client_conversation_reads" ("conversation_id");

CREATE TABLE IF NOT EXISTS "client_message_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
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

ALTER TABLE "client_message_templates" ADD COLUMN IF NOT EXISTS "default_metadata" jsonb;
ALTER TABLE "client_message_templates" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "client_message_templates" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "client_message_templates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "client_msg_templates_tenant_idx" ON "client_message_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "client_msg_templates_active_idx" ON "client_message_templates" ("tenant_id", "is_active");
