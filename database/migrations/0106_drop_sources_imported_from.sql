-- Stored state nothing reads or writes any more (tests/architecture.test.ts names such leftovers).
ALTER TABLE sources DROP COLUMN IF EXISTS imported_from;
