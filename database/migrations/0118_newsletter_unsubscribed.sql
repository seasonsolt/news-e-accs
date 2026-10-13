-- When the mail provider first reported a confirmed address as unsubscribed (newsletter/unsubscribes.ts reads
-- Resend daily); cleared when the reader confirms again or resubscribes. Subscriber counts leave these out.
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
