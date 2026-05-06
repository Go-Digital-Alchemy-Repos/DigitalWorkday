ALTER TABLE "task_attachments"
ADD COLUMN IF NOT EXISTS "subtask_id" varchar REFERENCES "subtasks"("id");

CREATE INDEX IF NOT EXISTS "task_attachments_subtask"
ON "task_attachments" ("subtask_id");
