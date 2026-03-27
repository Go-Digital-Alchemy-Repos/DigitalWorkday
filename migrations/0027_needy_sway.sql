CREATE INDEX IF NOT EXISTS "projects_workspace_id_idx" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_tenant_workspace_idx" ON "projects" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_assignees_task_id_idx" ON "task_assignees" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_status_idx" ON "tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_priority_idx" ON "tasks" USING btree ("status","priority");
