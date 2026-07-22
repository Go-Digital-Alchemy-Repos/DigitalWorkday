CREATE INDEX IF NOT EXISTS "time_entries_tenant_client_start_idx"
  ON "time_entries" ("tenant_id", "client_id", "start_time");

CREATE INDEX IF NOT EXISTS "tasks_tenant_project_archived_status_idx"
  ON "tasks" ("tenant_id", "project_id", "archived_at", "status");

CREATE INDEX IF NOT EXISTS "task_assignees_tenant_task_idx"
  ON "task_assignees" ("tenant_id", "task_id");
