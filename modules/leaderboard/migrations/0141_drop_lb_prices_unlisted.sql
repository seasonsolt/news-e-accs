-- The "no longer listed" mark went with the page-reading price check.
ALTER TABLE lb_prices DROP COLUMN IF EXISTS unlisted_on;
