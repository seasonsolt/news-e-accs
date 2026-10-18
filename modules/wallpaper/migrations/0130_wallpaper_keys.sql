CREATE TABLE wallpaper_keys (
  subscriber_id bigint PRIMARY KEY REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  credits integer NOT NULL CHECK (credits >= 0),
  granted integer NOT NULL,
  link_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
