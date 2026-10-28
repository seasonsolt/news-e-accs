-- One random salt per site day (Asia/Taipei) for telling visitors apart within that day. The collector deletes
-- every earlier day's salt when a new day starts, after which no stored visitor hash can be recomputed or linked.
CREATE TABLE IF NOT EXISTS site_salts (
  day        date PRIMARY KEY,
  salt       bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
