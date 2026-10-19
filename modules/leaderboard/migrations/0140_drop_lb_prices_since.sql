-- Prices now come from OpenRouter and nothing reads the day a price took effect (the cost-of-intelligence
-- index keeps to the official price files).
ALTER TABLE lb_prices DROP COLUMN IF EXISTS since;
