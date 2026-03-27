CREATE INDEX "activity_log_actor_idx" ON "activity_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "activity_log_workspace_created_idx" ON "activity_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "clients_tenant_status_idx" ON "clients" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "clients_tenant_workspace_idx" ON "clients" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_user_idx" ON "notifications" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_status_idx" ON "projects" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "projects_tenant_client_idx" ON "projects" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_created_at_idx" ON "projects" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "task_attachments_uploader_idx" ON "task_attachments" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "tasks_tenant_project_idx" ON "tasks" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "tasks_tenant_status_idx" ON "tasks" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "tasks_tenant_created_by_idx" ON "tasks" USING btree ("tenant_id","created_by");--> statement-breakpoint
CREATE INDEX "tasks_tenant_due_date_idx" ON "tasks" USING btree ("tenant_id","due_date");--> statement-breakpoint
CREATE INDEX "time_entries_tenant_user_start_idx" ON "time_entries" USING btree ("tenant_id","user_id","start_time");--> statement-breakpoint
CREATE INDEX "time_entries_tenant_project_start_idx" ON "time_entries" USING btree ("tenant_id","project_id","start_time");--> statement-breakpoint
CREATE INDEX "time_entries_tenant_client_idx" ON "time_entries" USING btree ("tenant_id","client_id");