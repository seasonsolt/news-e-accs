CREATE TABLE essay_tasks (
  id bigserial PRIMARY KEY,
  essay_id bigint NOT NULL REFERENCES essays (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('outline', 'draft', 'revise', 'localize', 'search', 'draw')),
  lane text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'accepted', 'discarded')),
  input jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  error text,
  receipt_id bigint,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
