-- Preserve legacy delivery without claiming that an existing reader chose Chinese.
ALTER TABLE newsletter_subscribers ADD COLUMN language text NOT NULL DEFAULT 'zh' CHECK (language IN ('en', 'zh'));
ALTER TABLE newsletter_subscribers ADD COLUMN language_preference_known boolean NOT NULL DEFAULT false;
ALTER TABLE newsletter_subscribers ALTER COLUMN language SET DEFAULT 'en';
ALTER TABLE newsletter_subscribers ALTER COLUMN language_preference_known SET DEFAULT true;

-- Keep the original claim table and its unique report_key for compatible old readers/writers.
-- Any row there is a wildcard covering both editions. New sends have a separate language claim.
CREATE TABLE newsletter_language_sends (
  report_key text NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'zh')),
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'unknown', 'skipped')),
  broadcast_id text,
  response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (report_key, language)
);
