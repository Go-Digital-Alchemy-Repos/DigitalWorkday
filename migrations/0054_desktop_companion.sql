CREATE TABLE IF NOT EXISTS "desktop_authorization_codes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_hash" varchar(64) NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workspace_id" varchar NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "code_challenge" varchar(128) NOT NULL,
  "redirect_uri" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "desktop_authorization_codes_hash_unique"
  ON "desktop_authorization_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "desktop_authorization_codes_expiry_idx"
  ON "desktop_authorization_codes" ("expires_at");
CREATE INDEX IF NOT EXISTS "desktop_authorization_codes_user_idx"
  ON "desktop_authorization_codes" ("user_id");

CREATE TABLE IF NOT EXISTS "desktop_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workspace_id" varchar NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "device_name" text,
  "ip_address" text,
  "user_agent" text,
  "access_token_hash" varchar(64) NOT NULL,
  "access_expires_at" timestamp NOT NULL,
  "refresh_token_hash" varchar(64) NOT NULL,
  "refresh_expires_at" timestamp NOT NULL,
  "last_used_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "desktop_sessions_access_hash_unique"
  ON "desktop_sessions" ("access_token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "desktop_sessions_refresh_hash_unique"
  ON "desktop_sessions" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "desktop_sessions_user_idx"
  ON "desktop_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "desktop_sessions_access_expiry_idx"
  ON "desktop_sessions" ("access_expires_at");

CREATE TABLE IF NOT EXISTS "desktop_idempotency_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "desktop_sessions"("id") ON DELETE CASCADE,
  "idempotency_key" varchar(200) NOT NULL,
  "method" varchar(12) NOT NULL,
  "path" text NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "desktop_idempotency_scope_unique"
  ON "desktop_idempotency_keys" ("session_id", "idempotency_key", "method", "path");
CREATE INDEX IF NOT EXISTS "desktop_idempotency_expiry_idx"
  ON "desktop_idempotency_keys" ("expires_at");
