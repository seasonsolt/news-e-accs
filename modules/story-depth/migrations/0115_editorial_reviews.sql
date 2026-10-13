CREATE TABLE editorial_reviews (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  subject_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'pending', 'failed', 'published', 'rejected', 'superseded')),
  version integer NOT NULL DEFAULT 1,
  draft jsonb,
  evidence jsonb NOT NULL DEFAULT '[]',
  receipt_id bigint,
  error text,
  requested_by text NOT NULL,
  reviewed_by text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (status NOT IN ('pending', 'published') OR draft IS NOT NULL),
  CHECK (status <> 'published' OR (reviewed_by IS NOT NULL AND published_at IS NOT NULL))
);
