CREATE TABLE essay_publications (
  id bigserial PRIMARY KEY,
  essay_id bigint NOT NULL REFERENCES essays (id) ON DELETE CASCADE,
  slug text NOT NULL,
  status text NOT NULL CHECK (status IN ('live', 'superseded', 'withdrawn')),
  editions jsonb NOT NULL,
  cover jsonb NOT NULL,
  files text[] NOT NULL,
  first_published_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text NOT NULL
);
