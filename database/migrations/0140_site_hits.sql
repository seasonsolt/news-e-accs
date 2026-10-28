-- What happened in a session, in order: page views (kind 'view', with the page's own path and its route) and the
-- allowlisted interactions of site_events_daily (kind is the event name, target as stored there).
CREATE TABLE IF NOT EXISTS site_hits (
  session_id bigint NOT NULL REFERENCES site_sessions (id) ON DELETE CASCADE,
  seq        int NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  kind       text NOT NULL,
  route      text NOT NULL DEFAULT '',
  path       text NOT NULL DEFAULT '',
  target     text NOT NULL DEFAULT '',
  engaged_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, seq)
);
