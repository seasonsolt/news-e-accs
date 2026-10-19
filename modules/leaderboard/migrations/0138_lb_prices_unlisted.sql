-- The day the daily price check marked the price no longer listed: its official page and the vendor's
-- pricing page had not listed the model for three days in a row. Cleared when a check finds it again.
ALTER TABLE lb_prices ADD COLUMN unlisted_on date;
