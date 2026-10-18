-- One row per model and Beijing day the daily price check read it. outcome: same (the official price
-- stands), changed / added (written to lb_prices; previous holds the price it replaced), held (a new
-- price not yet confirmed by OpenRouter or a second day), unread (the page or the model's row could
-- not be read). Prices per million tokens, as the page lists them.
CREATE TABLE lb_price_checks (
  model_id      text NOT NULL REFERENCES lb_models (id),
  checked_on    date NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('same', 'changed', 'added', 'held', 'unread')),
  source_url    text NOT NULL,
  currency      text CHECK (currency IN ('CNY', 'USD')),
  input         numeric(14, 6),
  output        numeric(14, 6),
  cached_input  numeric(14, 6),
  quote         text,
  openrouter    jsonb,
  previous      jsonb,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model_id, checked_on)
);
