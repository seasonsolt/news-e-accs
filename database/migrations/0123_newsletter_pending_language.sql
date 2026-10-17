-- A later signup's language. It replaces newsletter_subscribers.language only after the confirmation link is opened.
ALTER TABLE newsletter_subscribers ADD COLUMN pending_language text;
