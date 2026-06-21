-- ============================================================
-- 003_installment_workflow.sql
-- Installment scheduling at approval + payment claim/confirm workflow
-- + audit trail + reminder/threshold config.
--
-- ⚠️ RUN ORDER MATTERS — Postgres forbids ALTER TYPE ... ADD VALUE in the
--    same transaction that later USES the new value. Run STEP 1 on its own
--    first (select just those lines → Run), then run STEP 2.
-- ============================================================


-- ============================================================
-- STEP 1 — run ALONE first, then continue with STEP 2
-- ============================================================
ALTER TYPE installment_status ADD VALUE IF NOT EXISTS 'awaiting_confirmation';
ALTER TYPE installment_status ADD VALUE IF NOT EXISTS 'defaulted';
-- existing values: pending, paid, overdue


-- ============================================================
-- STEP 2 — run after STEP 1 has committed
-- ============================================================

-- 2a. Installments are now created at APPROVAL by the API (with the
--     approver's installment count / base amount / first due date), so the
--     old auto-create-on-insert triggers must go. Keep update_updated_at.
DROP TRIGGER IF EXISTS trg_create_installments ON dialog_tv_sales;
DROP TRIGGER IF EXISTS trg_calc_installment ON dialog_tv_sales;
DROP FUNCTION IF EXISTS create_installment_rows();
DROP FUNCTION IF EXISTS calculate_installment_amount();

-- 2b. dialog_tv_sales: record the approval-time installment configuration.
ALTER TABLE dialog_tv_sales
  ADD COLUMN IF NOT EXISTS base_amount    NUMERIC(10,2),                            -- down payment already paid
  ADD COLUMN IF NOT EXISTS first_due_date DATE,                                     -- due date of installment #1
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

-- 2c. installments: per-payable claim/confirm tracking.
--     The base/down-payment is stored as the row with installment_number = 0
--     and is_base = true, so it flows through the same workflow as the schedule.
ALTER TABLE installments
  ADD COLUMN IF NOT EXISTS is_base      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_amount  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS claimed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finance_note TEXT;

CREATE INDEX IF NOT EXISTS idx_installments_claimed_by ON installments(claimed_by);
CREATE INDEX IF NOT EXISTS idx_installments_confirmed_by ON installments(confirmed_by);

-- 2d. Audit trail: one row per action (comment / claim / confirm / reject /
--     approval). installment_id NULL means a sale-level event.
DO $$ BEGIN
  CREATE TYPE payment_event_type AS ENUM (
    'comment',
    'claim',
    'confirm',
    'reject',
    'approve_sale',
    'reject_sale',
    'mark_defaulted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payment_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES dialog_tv_sales(id) ON DELETE CASCADE,
  installment_id  UUID REFERENCES installments(id) ON DELETE CASCADE,  -- NULL = sale-level
  event_type      payment_event_type NOT NULL,
  author_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  note            TEXT,
  amount          NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_sale ON payment_events(sale_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_installment ON payment_events(installment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_author ON payment_events(author_id);

-- 2e. Configurable thresholds (read by the API / reminder cron).
INSERT INTO app_config (key, value) VALUES
  ('default_days_threshold', '30'),   -- overdue this many days => defaulted
  ('reminder_days_before',   '7'),    -- email staff this many days before due
  ('overdue_days_after',     '1')     -- overdue notice this many days after due
ON CONFLICT (key) DO NOTHING;

-- 2f. OPTIONAL one-time cleanup: remove installment rows the old trigger
--     auto-created for sales that are still pending (they'll be regenerated
--     at approval with the correct schedule). Uncomment to run.
-- DELETE FROM installments
--  WHERE sale_id IN (SELECT id FROM dialog_tv_sales WHERE status = 'pending');
