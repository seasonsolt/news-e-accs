CREATE TABLE essay_revisions (
  id bigserial PRIMARY KEY,
  essay_id bigint NOT NULL REFERENCES essays (id) ON DELETE CASCADE,
  part text NOT NULL CHECK (part IN ('outline', 'en', 'zh')),
  source text NOT NULL CHECK (source IN ('outline', 'draft', 'revise', 'localize', 'manual')),
  content jsonb NOT NULL,
  style text,
  style_hash text,
  receipt_id bigint,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
