-- Safe additive migration for production
-- Uses IF NOT EXISTS to be idempotent

-- ============================================================================
-- ERROR LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "error_logs" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "request_id" varchar NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id"),
    "user_id" varchar REFERENCES "users"("id"),
    "method" text NOT NULL,
    "path" text NOT NULL,
    "status" integer NOT NULL,
    "error_name" text,
    "message" text NOT NULL,
    "stack" text,
    "db_code" text,
    "db_constraint" text,
    "meta" jsonb,
    "environment" text DEFAULT 'development',
    "resolved" boolean DEFAULT false,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "error_logs_created_at_idx" ON "error_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "error_logs_request_id_idx" ON "error_logs" ("request_id");
CREATE INDEX IF NOT EXISTS "error_logs_tenant_idx" ON "error_logs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "error_logs_status_idx" ON "error_logs" ("status");

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "notification_preferences" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id"),
    "user_id" varchar REFERENCES "users"("id") NOT NULL,
    "task_deadline" boolean DEFAULT true NOT NULL,
    "task_assigned" boolean DEFAULT true NOT NULL,
    "task_completed" boolean DEFAULT true NOT NULL,
    "comment_added" boolean DEFAULT true NOT NULL,
    "comment_mention" boolean DEFAULT true NOT NULL,
    "project_update" boolean DEFAULT true NOT NULL,
    "project_member_added" boolean DEFAULT true NOT NULL,
    "task_status_changed" boolean DEFAULT false NOT NULL,
    "email_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_idx" ON "notification_preferences" ("user_id");

-- ============================================================================
-- CHAT CHANNELS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_channels" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "name" text NOT NULL,
    "is_private" boolean DEFAULT false NOT NULL,
    "created_by" varchar REFERENCES "users"("id") NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_channels_tenant_idx" ON "chat_channels" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_channels_created_by_idx" ON "chat_channels" ("created_by");

-- ============================================================================
-- CHAT CHANNEL MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_channel_members" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "channel_id" varchar REFERENCES "chat_channels"("id") NOT NULL,
    "user_id" varchar REFERENCES "users"("id") NOT NULL,
    "role" text DEFAULT 'member' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_channel_members_tenant_idx" ON "chat_channel_members" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_channel_members_channel_idx" ON "chat_channel_members" ("channel_id");
CREATE INDEX IF NOT EXISTS "chat_channel_members_user_idx" ON "chat_channel_members" ("user_id");

-- ============================================================================
-- CHAT DM THREADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_dm_threads" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_dm_threads_tenant_idx" ON "chat_dm_threads" ("tenant_id");

-- ============================================================================
-- CHAT DM MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_dm_members" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "dm_thread_id" varchar REFERENCES "chat_dm_threads"("id") NOT NULL,
    "user_id" varchar REFERENCES "users"("id") NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_dm_members_tenant_idx" ON "chat_dm_members" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_dm_members_thread_idx" ON "chat_dm_members" ("dm_thread_id");
CREATE INDEX IF NOT EXISTS "chat_dm_members_user_idx" ON "chat_dm_members" ("user_id");

-- ============================================================================
-- CHAT MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "channel_id" varchar REFERENCES "chat_channels"("id"),
    "dm_thread_id" varchar REFERENCES "chat_dm_threads"("id"),
    "author_user_id" varchar REFERENCES "users"("id") NOT NULL,
    "body" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "edited_at" timestamp,
    "deleted_at" timestamp,
    "archived_at" timestamp
);

CREATE INDEX IF NOT EXISTS "chat_messages_tenant_idx" ON "chat_messages" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_messages_channel_idx" ON "chat_messages" ("channel_id");
CREATE INDEX IF NOT EXISTS "chat_messages_dm_thread_idx" ON "chat_messages" ("dm_thread_id");
CREATE INDEX IF NOT EXISTS "chat_messages_author_idx" ON "chat_messages" ("author_user_id");
CREATE INDEX IF NOT EXISTS "chat_messages_created_idx" ON "chat_messages" ("created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_archived_idx" ON "chat_messages" ("archived_at");

-- ============================================================================
-- CHAT READS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_reads" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "user_id" varchar REFERENCES "users"("id") NOT NULL,
    "channel_id" varchar REFERENCES "chat_channels"("id"),
    "dm_thread_id" varchar REFERENCES "chat_dm_threads"("id"),
    "last_read_message_id" varchar REFERENCES "chat_messages"("id"),
    "last_read_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_reads_tenant_idx" ON "chat_reads" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_reads_user_idx" ON "chat_reads" ("user_id");
CREATE INDEX IF NOT EXISTS "chat_reads_channel_idx" ON "chat_reads" ("channel_id");
CREATE INDEX IF NOT EXISTS "chat_reads_dm_thread_idx" ON "chat_reads" ("dm_thread_id");

-- ============================================================================
-- CHAT MENTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_mentions" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "message_id" varchar REFERENCES "chat_messages"("id") NOT NULL,
    "mentioned_user_id" varchar REFERENCES "users"("id") NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_mentions_tenant_idx" ON "chat_mentions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_mentions_message_idx" ON "chat_mentions" ("message_id");
CREATE INDEX IF NOT EXISTS "chat_mentions_user_idx" ON "chat_mentions" ("mentioned_user_id");

-- ============================================================================
-- CHAT ATTACHMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "chat_attachments" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar REFERENCES "tenants"("id") NOT NULL,
    "message_id" varchar REFERENCES "chat_messages"("id") NOT NULL,
    "uploaded_by_user_id" varchar REFERENCES "users"("id") NOT NULL,
    "original_file_name" text NOT NULL,
    "mime_type" text NOT NULL,
    "file_size_bytes" integer NOT NULL,
    "storage_key" text NOT NULL,
    "upload_status" text DEFAULT 'pending' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_attachments_tenant_idx" ON "chat_attachments" ("tenant_id");
CREATE INDEX IF NOT EXISTS "chat_attachments_message_idx" ON "chat_attachments" ("message_id");

-- ============================================================================
-- ACTIVE TIMERS - ADD TITLE COLUMN IF MISSING
-- ============================================================================
ALTER TABLE "active_timers" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "active_timers" ADD COLUMN IF NOT EXISTS "tenant_id" varchar REFERENCES "tenants"("id");

-- ============================================================================
-- TENANTS - ADD CHAT RETENTION DAYS IF MISSING
-- ============================================================================
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "chat_retention_days" integer DEFAULT 365;

-- ============================================================================
-- TENANT SETTINGS - ADD CHAT RETENTION DAYS IF MISSING
-- ============================================================================
ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "chat_retention_days" integer;

-- ============================================================================
-- SYSTEM SETTINGS - ADD CHAT RETENTION DAYS IF MISSING
-- ============================================================================
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "chat_retention_days" integer DEFAULT 365;
