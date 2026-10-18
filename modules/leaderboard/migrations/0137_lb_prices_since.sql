-- The day the official price took effect, kept apart from verified_on (the last day it was checked).
-- Null on prices from before the daily check: those took effect by their verified_on.
ALTER TABLE lb_prices ADD COLUMN since date;
