CREATE TABLE "client_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"project_id" varchar,
	"subject" text NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"conversation_id" varchar NOT NULL,
	"author_user_id" varchar NOT NULL,
	"body_text" text NOT NULL,
	"body_rich" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_conversations" ADD CONSTRAINT "client_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD CONSTRAINT "client_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD CONSTRAINT "client_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD CONSTRAINT "client_conversations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_conversation_id_client_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."client_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_conversations_tenant_idx" ON "client_conversations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_conversations_client_idx" ON "client_conversations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_conversations_project_idx" ON "client_conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "client_messages_tenant_idx" ON "client_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_messages_conversation_idx" ON "client_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "client_messages_created_idx" ON "client_messages" USING btree ("created_at");