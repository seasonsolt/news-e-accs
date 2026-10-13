CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS editorial_reviews_published ON editorial_reviews (kind, subject_id) WHERE status = 'published';
