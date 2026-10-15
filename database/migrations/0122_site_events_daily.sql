-- Aggregate public interaction counts by local site date (Asia/Taipei). No per-visit or visitor data is stored.
CREATE TABLE site_events_daily (
  day        date NOT NULL,
  event      text NOT NULL,
  target     text NOT NULL DEFAULT '',
  count      bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, event, target)
);
