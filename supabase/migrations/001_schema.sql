-- ============================================================
-- Global Tech Holdings — Consolidated Database Schema
-- Single source of truth (replaces the old 001/002/003 split).
-- Pure data schema. NO RLS — all access control is in the API layer
-- (withAuth + scope-query) using the Supabase secret key.
--
-- Safe to run on a fresh OR existing (dev) project: it drops everything
-- first, then recreates. Run once in the Supabase SQL editor (plain "Run";
-- do NOT enable RLS).
--
-- NOTE: this drops `profiles` (which FKs auth.users) but not auth.users
-- itself. After running, clear stale auth users so phones can re-register,
-- then re-seed the admin.
-- ============================================================

-- ──────────────────────────────────────────────
-- 0. CLEAN SLATE
-- ──────────────────────────────────────────────
DROP TABLE IF EXISTS notification_log CASCADE;
DROP TABLE IF EXISTS payment_events CASCADE;
DROP TABLE IF EXISTS installments CASCADE;
DROP TABLE IF EXISTS dialog_tv_sales CASCADE;
DROP TABLE IF EXISTS app_config CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP TYPE IF EXISTS payment_event_type CASCADE;
DROP TYPE IF EXISTS installment_status CASCADE;
DROP TYPE IF EXISTS sale_status CASCADE;
DROP TYPE IF EXISTS payment_type CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ──────────────────────────────────────────────
-- 1. ENUM TYPES
-- ──────────────────────────────────────────────
CREATE TYPE user_role AS ENUM (
  'rep',          -- Sales Representative (field agent)
  'supervisor',   -- Supervisor (supervises reps; was "team_lead")
  'manager',      -- Manager (supervises supervisors)
  'admin',        -- Admin (maps to MD)
  'finance',      -- Finance team
  'support'       -- Customer support
);

CREATE TYPE user_status AS ENUM ('pending', 'active', 'inactive');

CREATE TYPE payment_type AS ENUM ('full', 'installment');

CREATE TYPE sale_status AS ENUM ('pending', 'approved', 'rejected', 'completed');

CREATE TYPE installment_status AS ENUM (
  'pending',
  'awaiting_confirmation',  -- someone marked it paid; awaiting finance
  'paid',                   -- finance confirmed
  'overdue',
  'defaulted'
);

CREATE TYPE payment_event_type AS ENUM (
  'comment',
  'claim',
  'confirm',
  'reject',
  'approve_sale',
  'reject_sale',
  'mark_defaulted',
  'amend'                   -- supervisor/manager changed the rep's proposed plan
);

-- ──────────────────────────────────────────────
-- 2. PROFILES (login id = mobile phone)
-- ──────────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE,                       -- optional, comms only
  phone       TEXT NOT NULL UNIQUE CHECK (phone ~ '^07[0-9]{8}$'),  -- login id
  role        user_role NOT NULL DEFAULT 'rep',
  reports_to  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status      user_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_reports_to ON profiles(reports_to);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_phone ON profiles(phone);

-- ──────────────────────────────────────────────
-- 3. APP CONFIG
-- ──────────────────────────────────────────────
CREATE TABLE app_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_config (key, value) VALUES
  ('default_installment_count', '3'),
  ('installment_options', '[1, 2, 3]'),
  ('notification_recipients_finance', '[]'),
  ('default_days_threshold', '30'),   -- overdue this many days => defaulted
  ('reminder_days_before', '7'),      -- email staff this many days before due
  ('overdue_days_after', '1');        -- overdue notice this many days after due

-- ──────────────────────────────────────────────
-- 4. DIALOG TV SALES
-- ──────────────────────────────────────────────
-- The rep records a PROPOSED plan (proposed_*). A supervisor later confirms the
-- installation date as the down-payment date and may amend amount/count; the live
-- columns hold the finalized values, and proposed_* preserve the rep's original.
CREATE TABLE dialog_tv_sales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  -- Customer details (may be entered in Sinhala)
  customer_name       TEXT NOT NULL,
  nic_number          TEXT NOT NULL,
  permanent_address   TEXT NOT NULL,
  personal_phone      TEXT NOT NULL,
  office_phone        TEXT,

  -- Payment plan (finalized values)
  payment_type        payment_type NOT NULL DEFAULT 'installment',
  total_amount        NUMERIC(10,2) NOT NULL,
  base_amount         NUMERIC(10,2),              -- down payment
  num_installments    INTEGER NOT NULL DEFAULT 3,
  installment_amount  NUMERIC(10,2),
  down_payment_date   DATE,                        -- anchor; installments run monthly from here

  -- Rep's original proposal (retained for audit/comparison)
  proposed_base_amount       NUMERIC(10,2),
  proposed_num_installments  INTEGER,
  proposed_down_payment_date DATE,

  -- Status / approval
  status              sale_status NOT NULL DEFAULT 'pending',
  approved_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_rep_id ON dialog_tv_sales(rep_id);
CREATE INDEX idx_sales_status ON dialog_tv_sales(status);
CREATE INDEX idx_sales_created_at ON dialog_tv_sales(created_at DESC);
CREATE INDEX idx_sales_nic ON dialog_tv_sales(nic_number);

-- ──────────────────────────────────────────────
-- 5. INSTALLMENTS (created at approval; row 0 = down payment)
-- ──────────────────────────────────────────────
CREATE TABLE installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id             UUID NOT NULL REFERENCES dialog_tv_sales(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL,            -- 0 = base/down payment
  is_base             BOOLEAN NOT NULL DEFAULT false,
  amount              NUMERIC(10,2) NOT NULL,
  paid_amount         NUMERIC(10,2),
  due_date            DATE NOT NULL,
  paid_date           DATE,
  status              installment_status NOT NULL DEFAULT 'pending',
  claimed_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at          TIMESTAMPTZ,
  confirmed_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at        TIMESTAMPTZ,
  finance_note        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(sale_id, installment_number)
);

CREATE INDEX idx_installments_sale_id ON installments(sale_id);
CREATE INDEX idx_installments_status ON installments(status);
CREATE INDEX idx_installments_due_date ON installments(due_date);
CREATE INDEX idx_installments_claimed_by ON installments(claimed_by);
CREATE INDEX idx_installments_confirmed_by ON installments(confirmed_by);

-- ──────────────────────────────────────────────
-- 6. PAYMENT EVENTS (audit trail: author + timestamp)
-- ──────────────────────────────────────────────
CREATE TABLE payment_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES dialog_tv_sales(id) ON DELETE CASCADE,
  installment_id  UUID REFERENCES installments(id) ON DELETE CASCADE,  -- NULL = sale-level
  event_type      payment_event_type NOT NULL,
  author_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  note            TEXT,
  amount          NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_sale ON payment_events(sale_id, created_at);
CREATE INDEX idx_payment_events_installment ON payment_events(installment_id);
CREATE INDEX idx_payment_events_author ON payment_events(author_id);

-- ──────────────────────────────────────────────
-- 7. NOTIFICATION LOG (email now; channel supports future SMS/WhatsApp)
-- ──────────────────────────────────────────────
CREATE TABLE notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sale_id         UUID REFERENCES dialog_tv_sales(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL DEFAULT 'email',
  recipient_email TEXT,
  subject         TEXT,
  body            TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'sent'
);

CREATE INDEX idx_notifications_recipient ON notification_log(recipient_id);
CREATE INDEX idx_notifications_sale ON notification_log(sale_id);

-- ──────────────────────────────────────────────
-- 8. TRIGGERS — auto-update updated_at only (no auto-installment logic;
--    installments are created by the approval API).
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON dialog_tv_sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_installments_updated_at
  BEFORE UPDATE ON installments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
