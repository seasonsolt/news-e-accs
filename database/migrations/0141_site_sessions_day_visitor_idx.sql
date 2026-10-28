CREATE INDEX CONCURRENTLY IF NOT EXISTS site_sessions_day_visitor_idx ON site_sessions (day, visitor, last_at);
