CREATE INDEX "chat_message_reactions_message_idx" ON "chat_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "chat_reads_user_channel_idx" ON "chat_reads" USING btree ("user_id","channel_id");--> statement-breakpoint
CREATE INDEX "chat_reads_user_dm_idx" ON "chat_reads" USING btree ("user_id","dm_thread_id");