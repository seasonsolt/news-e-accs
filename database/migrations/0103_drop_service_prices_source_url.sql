-- Stored state nothing reads or writes any more (tests/architecture.test.ts names such leftovers).
ALTER TABLE service_prices DROP COLUMN IF EXISTS source_url;
