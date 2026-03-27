CREATE INDEX "projects_manager_idx" ON "projects" USING btree ("project_manager_id");--> statement-breakpoint
CREATE INDEX "subtasks_assignee_id_idx" ON "subtasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "time_entries_tenant_billing_status_idx" ON "time_entries" USING btree ("tenant_id","billing_status");