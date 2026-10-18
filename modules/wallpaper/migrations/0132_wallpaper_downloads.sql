CREATE TABLE wallpaper_downloads (
  subscriber_id bigint NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  wallpaper_id bigint NOT NULL REFERENCES wallpapers(id) ON DELETE CASCADE,
  first_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, wallpaper_id)
);
