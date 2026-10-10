-- Aggregate public page views by local site date and route. No per-visit or visitor data is stored.
CREATE TABLE site_pageviews_daily (
  day        date NOT NULL,
  path       text NOT NULL,
  views      bigint NOT NULL DEFAULT 0 CHECK (views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, path)
);
