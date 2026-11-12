CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS essay_tasks_active ON essay_tasks (essay_id, lane) WHERE status IN ('queued', 'running');
