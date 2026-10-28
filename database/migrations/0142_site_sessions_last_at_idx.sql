-- The admin's live view reads the sessions active in the last few minutes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_sessions_last_at_idx ON site_sessions (last_at);
