ALTER TABLE "active_timers"
ADD COLUMN IF NOT EXISTS "subtask_id" varchar REFERENCES "subtasks"("id");

CREATE INDEX IF NOT EXISTS "active_timers_subtask_idx"
ON "active_timers" ("subtask_id");
