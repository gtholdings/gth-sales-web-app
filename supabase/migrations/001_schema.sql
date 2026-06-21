-- ============================================================
-- Global Tech Holdings - Database Schema (v3)
-- Pure data schema. NO RLS. All access control in Express.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CUSTOM TYPES
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'rep',        -- Sales Representative (field agent)
  'team_lead',  -- Team Lead (supervises reps)
  'manager',    -- Manager (supervises team leads)
  'admin',      -- Admin (maps to MD in real world)
  'finance',    -- Finance team
  'support'     -- Customer support
);

CREATE TYPE user_status AS ENUM (
  'pending',    -- Awaiting approval
  'active',     -- Approved and active
  'inactive'    -- Deactivated
);

CREATE TYPE payment_type AS ENUM (
  'full',
  'installment'
);

CREATE TYPE sale_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'completed'
);

CREATE TYPE installment_status AS ENUM (
  'pending',
  'paid',
  'overdue'
);

-- ────────────────────────────────────────────────────────────
-- 2. PROFILES TABLE
-- ────────────────────────────────────────────────────────────
-- reports_to defines the org hierarchy.
-- Express middleware uses this to scope data queries.

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  phone       TEXT,
  role        user_role NOT NULL DEFAULT 'rep',
  reports_to  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status      user_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_reports_to ON profiles(reports_to);
CREATE INDEX idx_profiles_status ON profiles(status);

-- ────────────────────────────────────────────────────────────
-- 3. APP CONFIGURATION TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE app_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_config (key, value) VALUES
  ('default_installment_count', '3'),
  ('installment_options', '[1, 2, 3]'),
  ('notification_recipients_finance', '[]');

-- ────────────────────────────────────────────────────────────
-- 4. DIALOG TV SALES TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE dialog_tv_sales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  -- Customer details
  customer_name       TEXT NOT NULL,
  nic_number          TEXT NOT NULL,
  permanent_address   TEXT NOT NULL,
  personal_phone      TEXT NOT NULL,
  office_phone        TEXT,

  -- Payment details
  payment_type        payment_type NOT NULL DEFAULT 'installment',
  total_amount        NUMERIC(10,2) NOT NULL,
  num_installments    INTEGER NOT NULL DEFAULT 3,
  installment_amount  NUMERIC(10,2),

  -- Status
  status              sale_status NOT NULL DEFAULT 'pending',
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_rep_id ON dialog_tv_sales(rep_id);
CREATE INDEX idx_sales_status ON dialog_tv_sales(status);
CREATE INDEX idx_sales_created_at ON dialog_tv_sales(created_at DESC);
CREATE INDEX idx_sales_nic ON dialog_tv_sales(nic_number);

-- ────────────────────────────────────────────────────────────
-- 5. INSTALLMENTS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id             UUID NOT NULL REFERENCES dialog_tv_sales(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  due_date            DATE NOT NULL,
  paid_date           DATE,
  status              installment_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(sale_id, installment_number)
);

CREATE INDEX idx_installments_sale_id ON installments(sale_id);
CREATE INDEX idx_installments_status ON installments(status);
CREATE INDEX idx_installments_due_date ON installments(due_date);

-- ────────────────────────────────────────────────────────────
-- 6. NOTIFICATION LOG TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sale_id       UUID REFERENCES dialog_tv_sales(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL DEFAULT 'email',
  recipient_email TEXT,
  subject       TEXT,
  body          TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'sent'
);

CREATE INDEX idx_notifications_recipient ON notification_log(recipient_id);
CREATE INDEX idx_notifications_sale ON notification_log(sale_id);

-- ────────────────────────────────────────────────────────────
-- 7. TRIGGERS (business logic only, no security)
-- ────────────────────────────────────────────────────────────

-- Auto-update updated_at on any row change
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

-- Auto-calculate installment amount
CREATE OR REPLACE FUNCTION calculate_installment_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_type = 'installment' AND NEW.num_installments > 0 THEN
    NEW.installment_amount = ROUND(NEW.total_amount / NEW.num_installments, 2);
  ELSE
    NEW.installment_amount = NEW.total_amount;
    NEW.num_installments = 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_installment
  BEFORE INSERT OR UPDATE ON dialog_tv_sales
  FOR EACH ROW EXECUTE FUNCTION calculate_installment_amount();

-- Auto-create installment rows on new sale
CREATE OR REPLACE FUNCTION create_installment_rows()
RETURNS TRIGGER AS $$
DECLARE
  i INTEGER;
BEGIN
  IF NEW.payment_type = 'installment' THEN
    FOR i IN 1..NEW.num_installments LOOP
      INSERT INTO installments (sale_id, installment_number, amount, due_date)
      VALUES (
        NEW.id,
        i,
        NEW.installment_amount,
        (NEW.created_at::date + (i * 30))
      );
    END LOOP;
  ELSE
    INSERT INTO installments (sale_id, installment_number, amount, due_date)
    VALUES (NEW.id, 1, NEW.total_amount, NEW.created_at::date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_installments
  AFTER INSERT ON dialog_tv_sales
  FOR EACH ROW EXECUTE FUNCTION create_installment_rows();
