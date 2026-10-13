CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS editorial_reviews_active ON editorial_reviews (kind, subject_id) WHERE status IN ('queued', 'pending', 'failed');
