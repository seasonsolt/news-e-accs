-- Email newsletter with double opt-in. This table decides who asked (pending) and who confirmed;
-- confirmed addresses become contacts in the mail provider (Resend), whose unsubscribe link then
-- governs delivery. The token is the only credential a confirmation link carries.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id               bigserial PRIMARY KEY,
  email            text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  token            text NOT NULL UNIQUE,
  source_hash      text,
  confirm_sent_at  timestamptz,
  confirmed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per issue sent, claimed before the provider is called, so a retried job or a regenerated
-- report never mails the same day twice. A send that ends in doubt stays 'unknown' for a person to check.
CREATE TABLE IF NOT EXISTS newsletter_sends (
  report_key    text PRIMARY KEY,
  status        text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'unknown', 'skipped')),
  broadcast_id  text,
  response      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);
