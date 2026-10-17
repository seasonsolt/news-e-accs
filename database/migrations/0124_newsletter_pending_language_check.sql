ALTER TABLE newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_pending_language_check CHECK (pending_language IN ('en', 'zh')) NOT VALID;
