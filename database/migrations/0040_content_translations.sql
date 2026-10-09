-- English editions are a separate projection; original editorial/publication data is untouched.
CREATE TABLE content_translations (
  kind text NOT NULL CHECK (kind IN ('item','story','report','body')),
  content_id text NOT NULL,
  lang text NOT NULL DEFAULT 'en' CHECK (lang = 'en'),
  source_hash text NOT NULL,
  source_segments jsonb NOT NULL,
  translations jsonb NOT NULL,
  provenance text NOT NULL CHECK (provenance IN ('provider','offline-agent','original')),
  model text NOT NULL,
  receipt_ids bigint[] NOT NULL DEFAULT '{}',
  translated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, content_id, lang),
  CHECK (provenance <> 'offline-agent' OR cardinality(receipt_ids) = 0)
);
CREATE INDEX content_translations_source ON content_translations(kind, content_id, source_hash);
