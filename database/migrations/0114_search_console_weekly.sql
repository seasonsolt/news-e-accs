-- Search Console's reading for one week (Monday to Sunday), taken once by the worker (operations/search-console.ts).
-- sections: by the address's first part ("story", "daily", "index"; /zh counted with the English page), each
-- with clicks, impressions, and how many of its discovery URLs were inspected and found indexed.
CREATE TABLE IF NOT EXISTS search_console_weekly (
  week         date PRIMARY KEY,
  property     text NOT NULL,
  clicks       integer NOT NULL,
  impressions  integer NOT NULL,
  inspected    integer NOT NULL,
  indexed      integer NOT NULL,
  sections     jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);
