CREATE TABLE essays (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'withdrawn')),
  style text NOT NULL,
  fragments text NOT NULL DEFAULT '',
  refs jsonb NOT NULL DEFAULT '[]',
  outline text NOT NULL DEFAULT '',
  editions jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
