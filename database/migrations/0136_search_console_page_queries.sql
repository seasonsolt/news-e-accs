-- Null means this week predates page/query collection; an empty snapshot means Google returned no rows.
ALTER TABLE search_console_weekly ADD COLUMN page_queries jsonb;
