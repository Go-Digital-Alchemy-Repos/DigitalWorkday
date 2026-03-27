ALTER TABLE "client_conversations" ADD COLUMN "assigned_to_user_id" varchar;--> statement-breakpoint
ALTER TABLE "client_messages" ADD COLUMN "visibility" varchar(20) DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD CONSTRAINT "client_conversations_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_conversations_assigned_idx" ON "client_conversations" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "client_messages_visibility_idx" ON "client_messages" USING btree ("visibility");