-- ============================================================
-- 003 — Email (Gmail SMTP) + retry-cap settings (NON-destructive)
-- Seeds the new app_config keys on a live DB. Safe to run repeatedly
-- (ON CONFLICT DO NOTHING never overwrites values you've set in Settings).
-- Run once in the Supabase SQL editor (plain "Run", no RLS).
-- ============================================================
INSERT INTO app_config (key, value) VALUES
  ('number_of_failed_retry_attempts', '3'),  -- email: retry a failed send 1×/day up to N days, then stop
  ('smtp_user', '""'),                        -- Gmail address reminders are sent FROM (set in Settings)
  ('smtp_app_password', '""'),                -- Gmail App Password (16 chars; set in Settings)
  ('smtp_from_name', '"GT Sales"')            -- sender display name
ON CONFLICT (key) DO NOTHING;
