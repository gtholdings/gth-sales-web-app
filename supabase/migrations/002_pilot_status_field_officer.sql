-- ============================================================
-- 002 — Pilot-safe forward migration (NON-destructive)
-- Brings a live/pilot DB (already on 001) up to the status-lifecycle +
-- Field Officer feature WITHOUT dropping any data.
--
-- It only touches the two ENUMs (no table/column drops):
--   • user_role   : adds 'field_officer'
--   • sale_status : 'approved'/'completed'  ->  'confirmed'/'in_progress'/'closed'
-- Existing rows are remapped in place. Run ONCE in the Supabase SQL editor
-- (plain "Run", no RLS). It is wrapped in a transaction, so a failure rolls
-- back cleanly with no half-applied state.
--
-- (Postgres can't rename/remove individual enum values, so the safe idiom is:
--  rename the old type -> create the new type -> cast the column across with a
--  mapping -> drop the old type. No `ALTER TYPE ... ADD VALUE`, so no
--  same-transaction restriction.)
-- ============================================================

BEGIN;

-- ── 1. user_role: add 'field_officer' (all existing values stay valid) ──
ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM (
  'rep', 'supervisor', 'manager', 'admin', 'credit_officer', 'field_officer'
);
ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING role::text::user_role;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'rep';
DROP TYPE user_role_old;

-- ── 2. sale_status: new value set, remap existing rows ──
ALTER TYPE sale_status RENAME TO sale_status_old;
CREATE TYPE sale_status AS ENUM (
  'pending', 'confirmed', 'in_progress', 'closed', 'rejected'
);
ALTER TABLE dialog_tv_sales ALTER COLUMN status DROP DEFAULT;
ALTER TABLE dialog_tv_sales
  ALTER COLUMN status TYPE sale_status
  USING (
    CASE status::text
      WHEN 'approved'  THEN 'confirmed'   -- refined below from payment state
      WHEN 'completed' THEN 'closed'
      WHEN 'rejected'  THEN 'rejected'
      ELSE 'pending'
    END
  )::sale_status;
ALTER TABLE dialog_tv_sales ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE sale_status_old;

-- ── 3. Refine active sales to their TRUE derived status from payments
--      (confirmed = 0 paid, in_progress = some paid, closed = all paid).
--      This matches src/lib/sale-status.js so stored == derived from day one. ──
WITH agg AS (
  SELECT sale_id,
         count(*)                              AS total,
         count(*) FILTER (WHERE status = 'paid') AS paid
  FROM installments
  GROUP BY sale_id
)
UPDATE dialog_tv_sales s
SET status = CASE
               WHEN a.total > 0 AND a.paid = a.total THEN 'closed'::sale_status
               WHEN a.paid >= 1                      THEN 'in_progress'::sale_status
               ELSE 'confirmed'::sale_status
             END,
    updated_at = now()
FROM agg a
WHERE a.sale_id = s.id
  AND s.status IN ('confirmed', 'in_progress', 'closed');

-- ── 4. Ensure the interest/installment config keys exist (harmless if present;
--      defaults already fall back to 10/12 in code). ──
INSERT INTO app_config (key, value) VALUES
  ('installment_interest_percent', '10'),
  ('max_installments', '12')
ON CONFLICT (key) DO NOTHING;

COMMIT;
