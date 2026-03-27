CREATE INDEX "projects_tenant_updated_at_idx" ON "projects" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_tenant_name_idx" ON "projects" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "task_assignees_user_task_idx" ON "task_assignees" USING btree ("user_id","task_id");