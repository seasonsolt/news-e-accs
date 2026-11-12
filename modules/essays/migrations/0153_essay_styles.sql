CREATE TABLE essay_styles (
  name text PRIMARY KEY CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  files jsonb NOT NULL,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
