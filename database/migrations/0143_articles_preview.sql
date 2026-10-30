-- The original page's share picture (og:image), looked up once per article: {url, width, height, shared, checkedAt}.
ALTER TABLE articles ADD COLUMN preview jsonb;
