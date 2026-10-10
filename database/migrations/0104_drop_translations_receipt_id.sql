-- Stored state nothing reads or writes any more (tests/architecture.test.ts names such leftovers).
ALTER TABLE translations DROP COLUMN IF EXISTS receipt_id;
