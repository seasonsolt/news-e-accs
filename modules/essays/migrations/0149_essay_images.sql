CREATE TABLE essay_images (
  essay_id bigint NOT NULL REFERENCES essays (id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot ~ '^(cover|figure-[1-9])$'),
  prompt text NOT NULL DEFAULT '',
  alt jsonb NOT NULL DEFAULT '{}',
  file text CHECK (file ~ '^[0-9a-f]{32}\.jpg$'),
  width integer,
  height integer,
  origin text CHECK (origin IN ('search', 'drawn', 'uploaded')),
  credit text,
  candidates jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (essay_id, slot)
);
