CREATE TABLE wallpapers (
  id bigserial PRIMARY KEY,
  day date NOT NULL UNIQUE,
  title_zh text NOT NULL,
  title_en text NOT NULL,
  desktop_file text NOT NULL,
  phone_file text NOT NULL,
  preview_file text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
