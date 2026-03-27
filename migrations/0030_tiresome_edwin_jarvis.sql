ALTER TABLE "client_conversations" ADD COLUMN "merged_into_id" varchar;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD COLUMN "merged_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD COLUMN "merged_by_user_id" varchar;--> statement-breakpoint
ALTER TABLE "client_conversations" ADD CONSTRAINT "client_conversations_merged_by_user_id_users_id_fk" FOREIGN KEY ("merged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_conversations_dup_detect_idx" ON "client_conversations" USING btree ("tenant_id","client_id","subject","created_at");