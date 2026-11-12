CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS essay_publications_live ON essay_publications (essay_id) WHERE status = 'live';
