-- ============================================================
-- 002_phone_login.sql
-- Switch the login identifier from email to mobile phone.
--
--   * Phone is now the unique, required login id (format: 07 + 8 digits).
--   * Email becomes optional — captured for communications only.
--
-- PREREQUISITE: every existing profiles row must already have a valid
-- phone in the 07XXXXXXXX format before running this, or the CHECK /
-- NOT NULL steps will fail. For a fresh project there are no rows, so
-- it just applies cleanly. (See the app's admin backfill if you have an
-- existing email-only account.)
-- ============================================================

-- 1. Email is no longer the login id, so it is no longer required.
--    (UNIQUE is kept from 001 — Postgres allows multiple NULLs under a
--    UNIQUE constraint, so optional-but-unique works as intended.)
ALTER TABLE profiles
  ALTER COLUMN email DROP NOT NULL;

-- 2. Enforce the strict local SL mobile format: 07 followed by 8 digits.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_phone_format CHECK (phone ~ '^07[0-9]{8}$');

-- 3. Phone is the unique login identifier.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);

-- 4. Phone is required.
ALTER TABLE profiles
  ALTER COLUMN phone SET NOT NULL;

-- Index to keep phone lookups (login) fast.
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
