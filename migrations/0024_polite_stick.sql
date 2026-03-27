CREATE TABLE "support_canned_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"title" text NOT NULL,
	"body_text" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_macros" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workspace_id" varchar,
	"title" text NOT NULL,
	"body_text" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"actions_json" jsonb DEFAULT '{}'::jsonb,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_canned_replies" ADD CONSTRAINT "support_canned_replies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_canned_replies" ADD CONSTRAINT "support_canned_replies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_canned_replies" ADD CONSTRAINT "support_canned_replies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_macros" ADD CONSTRAINT "support_macros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_macros" ADD CONSTRAINT "support_macros_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_macros" ADD CONSTRAINT "support_macros_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_canned_replies_tenant_idx" ON "support_canned_replies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "support_canned_replies_tenant_workspace_idx" ON "support_canned_replies" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "support_macros_tenant_idx" ON "support_macros" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "support_macros_tenant_workspace_idx" ON "support_macros" USING btree ("tenant_id","workspace_id");