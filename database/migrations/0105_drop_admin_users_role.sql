-- Stored state nothing reads or writes any more (tests/architecture.test.ts names such leftovers).
ALTER TABLE admin_users DROP COLUMN IF EXISTS role;
