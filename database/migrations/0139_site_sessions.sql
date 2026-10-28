-- Reader sessions (docs/analytics.md). visitor is a hash of that day's salt, address and user agent: it groups one
-- day's views and nothing else. first_seen and prev_seen are the browser's own record of its first and previous
-- visit dates (local storage), so cohorts and returning readers need no identifier that lasts across days.
CREATE TABLE IF NOT EXISTS site_sessions (
  id           bigserial PRIMARY KEY,
  day          date NOT NULL,
  visitor      text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  last_at      timestamptz NOT NULL DEFAULT now(),
  views        int NOT NULL DEFAULT 0,
  engaged_ms   bigint NOT NULL DEFAULT 0,
  landing      text NOT NULL,
  landing_page text NOT NULL,
  exit         text NOT NULL,
  channel      text NOT NULL,
  referrer     text NOT NULL DEFAULT '',
  utm_source   text NOT NULL DEFAULT '',
  utm_medium   text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '',
  browser      text NOT NULL,
  os           text NOT NULL,
  device       text NOT NULL,
  country      text NOT NULL DEFAULT '',
  language     text NOT NULL DEFAULT '',
  first_seen   date,
  prev_seen    date
);
