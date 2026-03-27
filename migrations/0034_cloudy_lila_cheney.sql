CREATE TABLE "chat_message_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"message_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"emoji" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_pins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"channel_id" varchar NOT NULL,
	"message_id" varchar NOT NULL,
	"pinned_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_conversation_reads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "deleted_by_user_id" varchar;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD COLUMN "type" varchar(30) DEFAULT 'everyday' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "ai_chat_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_pins" ADD CONSTRAINT "chat_pins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_pins" ADD CONSTRAINT "chat_pins_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_pins" ADD CONSTRAINT "chat_pins_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_pins" ADD CONSTRAINT "chat_pins_pinned_by_user_id_users_id_fk" FOREIGN KEY ("pinned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_conversation_reads" ADD CONSTRAINT "client_conversation_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_conversation_reads" ADD CONSTRAINT "client_conversation_reads_conversation_id_client_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."client_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_conversation_reads" ADD CONSTRAINT "client_conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_reactions_unique" ON "chat_message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "chat_message_reactions_tenant_message_idx" ON "chat_message_reactions" USING btree ("tenant_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_pins_channel_message_unique" ON "chat_pins" USING btree ("channel_id","message_id");--> statement-breakpoint
CREATE INDEX "chat_pins_tenant_idx" ON "chat_pins" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "chat_pins_channel_idx" ON "chat_pins" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "ccr_tenant_user_convo_idx" ON "client_conversation_reads" USING btree ("tenant_id","user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "ccr_conversation_idx" ON "client_conversation_reads" USING btree ("conversation_id");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_conversations_type_idx" ON "client_conversations" USING btree ("tenant_id","client_id","type");