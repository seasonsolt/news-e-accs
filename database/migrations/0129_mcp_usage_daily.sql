-- Anonymous counters only; dimensions are allowlisted by the MCP route.
CREATE TABLE IF NOT EXISTS mcp_usage_daily (
  day date NOT NULL,
  operation text NOT NULL,
  tool text NOT NULL DEFAULT '',
  outcome text NOT NULL,
  is_check boolean NOT NULL DEFAULT false,
  calls bigint NOT NULL DEFAULT 0,
  duration_ms double precision NOT NULL DEFAULT 0,
  max_duration_ms double precision NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, operation, tool, outcome, is_check)
);
