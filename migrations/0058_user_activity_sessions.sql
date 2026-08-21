CREATE TABLE IF NOT EXISTS "user_activity_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar,
	"workspace_id" varchar,
	"platform" text NOT NULL,
	"device_label" text NOT NULL,
	"source_session_id" varchar(128),
	"state" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_activity_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
	CONSTRAINT "user_activity_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
	CONSTRAINT "user_activity_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null,
	CONSTRAINT "user_activity_sessions_platform_check" CHECK ("platform" IN ('browser', 'macos')),
	CONSTRAINT "user_activity_sessions_state_check" CHECK ("state" IN ('active', 'idle', 'hidden', 'ended')),
	CONSTRAINT "user_activity_sessions_active_seconds_check" CHECK ("active_seconds" >= 0)
);
CREATE INDEX IF NOT EXISTS "user_activity_sessions_user_started_idx" ON "user_activity_sessions" USING btree ("user_id", "started_at");
CREATE INDEX IF NOT EXISTS "user_activity_sessions_tenant_started_idx" ON "user_activity_sessions" USING btree ("tenant_id", "started_at");
CREATE INDEX IF NOT EXISTS "user_activity_sessions_source_idx" ON "user_activity_sessions" USING btree ("source_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_activity_sessions_open_source_unique" ON "user_activity_sessions" USING btree ("source_session_id") WHERE "source_session_id" IS NOT NULL AND "ended_at" IS NULL;
CREATE INDEX IF NOT EXISTS "user_activity_sessions_last_seen_idx" ON "user_activity_sessions" USING btree ("last_seen_at");
