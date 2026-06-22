# GTH Sales — Global Tech Holdings Sales Management

A Progressive Web App for managing field **Dialog TV installment sales**. Reps capture
sales on their phones; **supervisors, managers, finance, and admin** run the approval,
down-payment collection, payment-confirmation, and reporting workflow via the web dashboard.

Built with **Next.js 15**, Supabase (Postgres + Auth), Tailwind CSS, Resend, exceljs +
date-fns. Deployed on Netlify. **English/Sinhala** bilingual. All free tiers — $0/month.

Highlights: **mobile-number login** (no email needed), installment scheduling with a
down-payment/installation-date workflow, a payment **claim → finance-confirm** flow with a
full audit trail, email reminders, reports with Excel export, and amounts always in **Rs.**

## Prerequisites
- **Node.js 22 LTS** (Next 15 needs `^20.19 || ^22.13 || >=24`; the app pins Node 22 on Netlify) — [nodejs.org](https://nodejs.org/)
- **npm** (bundled with Node)
- A free **Supabase** account ([supabase.com](https://supabase.com))
- A free **Resend** account ([resend.com](https://resend.com)) for email reminders

## Local Development Setup

### 1. Clone and install
```bash
git clone <your-repo-url>
cd global-tech-holdings
npm install
```

### 2. Create a Supabase project
1. [supabase.com](https://supabase.com) → **New Project** → **Singapore** region (closest to Sri Lanka)
2. Save the database password.

### 3. Run the database schema
1. Supabase → **SQL Editor** → **New query**
2. Paste **all** of `supabase/migrations/001_schema.sql` and click **Run** (plain "Run" — this app uses **no RLS**).
   - This is a single **consolidated** script: it **drops and recreates** everything, so it's safe to re-run on a dev project (it wipes data).
3. Verify in **Table Editor**: `profiles`, `dialog_tv_sales`, `installments`, `payment_events`, `notification_log`, `app_config`.

### 4. Authentication — nothing to toggle
Login is by **mobile number** (`07XXXXXXXX`), not email. The app creates accounts
server-side with the email pre-confirmed, so you do **not** need to touch Supabase's
"Confirm email" setting. Leave the Email provider enabled (default); no Phone/SMS provider is needed.

### 5. Configure environment variables
```bash
cp .env.local.example .env.local
```
Edit `.env.local` (keys are in Supabase → **Project Settings → API / API Keys**):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxx

RESEND_API_KEY=re_xxxxxxxx
NOTIFICATION_FROM_EMAIL=onboarding@resend.dev

CRON_SECRET=replace_with_a_long_random_string   # for the reminder cron (openssl rand -hex 32)
# LOG_LEVEL=debug                                 # optional (default: debug in dev, info in prod)
```
> **Keys:** Supabase uses **Publishable** (`sb_publishable_`, public, safe in the client) and
> **Secret** (`sb_secret_`, server-only, bypasses RLS) keys — replacing the legacy anon/service_role.

### 6. Start the dev server
```bash
npm run dev   # http://localhost:3000
```

### 7. Create your first admin account
1. Open `/register`, enter a **mobile number** (`07XXXXXXXX`) + password (email optional), submit.
   The account is **pending**.
2. Promote it in Supabase → **SQL Editor**:
   ```sql
   UPDATE profiles SET role = 'admin', status = 'active' WHERE phone = '0771234567';
   ```
3. Log in with that **mobile number + password** — you now have full admin access.

### 8. Try the workflow
1. **Admin** approves users (Admin page) and can set role + reporting supervisor/manager at approval.
2. **Rep** logs in → lands on **New Sale** → records a sale + a *proposed* plan (total, down
   payment, installments, proposed down-payment date). No money is collected.
3. **Supervisor/Manager** opens the pending sale (Sales → **Review**), enters the actual
   **installation / down-payment date**, optionally amends the amount/count (changes are
   logged), and **approves** — this generates the installment schedule.
4. **Finance** confirms the down payment and each installment against the bank.
5. **Reports** show paid/pending/defaulted totals, a defaulter list, and Excel export.

Toggle **English/සිංහල** any time from the dropdown in the top bar.

## Project Structure
```
├── src/
│   ├── app/
│   │   ├── layout.js                     # Root layout (Language + Auth providers, fonts, PWA manifest)
│   │   ├── page.js                       # Redirect by role (rep → new sale, else dashboard)
│   │   ├── login/ · register/            # Phone-based auth pages (+ language switcher)
│   │   ├── dashboard/ · sales/ · reports/ · admin/
│   │   ├── sales/new/                     # Sale capture form (Customer + Payment sections)
│   │   ├── sales/[id]/                    # Sale detail: approve/amend, payments, activity log
│   │   └── api/
│   │       ├── auth/{login,register}/     # mobile + password
│   │       ├── sales/  (GET list, POST create)
│   │       ├── sales/[id]/  · sales/[id]/approve/ · sales/[id]/comments/
│   │       ├── sales/[id]/installments/[installmentId]/{claim,confirm}/
│   │       ├── sales/reports/ · sales/reports/defaulters/ · sales/reports/export/ (xlsx)
│   │       ├── cron/installment-reminders/   # secured daily job
│   │       ├── admin/users/… · admin/config/
│   │       └── profiles/{supervisors,managers,reps}/ · profile/ · config/
│   ├── lib/  supabase · auth-middleware · scope-query · phone · installments · datetime
│   │        · format (Rs.) · notify · reports · excel · logger · nav · i18n/{en,si}
│   ├── components/  Navbar · SalesForm · SalesTable · StatsCards · ProtectedRoute
│   │              · InstallmentStatusBadge · LanguageSwitcher
│   └── contexts/  AuthContext · LanguageContext
├── supabase/migrations/001_schema.sql     # single consolidated schema (no RLS)
├── .github/workflows/                     # installment reminders + nightly DB backup
├── public/manifest.json + icons/          # installable PWA
├── docs/  ARCHITECTURE.md · SETUP_GUIDE.md
├── requirements.md (business SRS) · CLAUDE.md (project memory)
└── netlify.toml · next.config.mjs · tailwind.config.js · package.json
```

## Key Architecture Decisions
- **No RLS** — all access control is in the API via `withAuth()` + `scope-query.js`, using the
  Supabase **secret key**.
- **Phone login** — mobile number is the login id, implemented over Supabase email+password via a
  deterministic synthetic email (no SMS/OTP cost).
- **Installments at approval** — the schedule is generated when a supervisor collects the down
  payment, not at sale creation; due dates run monthly from the down-payment date (clamped to
  month-end). Amounts always shown as **Rs.**
- **i18n** — lightweight in-app dictionary (English/Sinhala), instant switch, no locale routing.
- **PWA** — installable ("Add to Home Screen"); updates deploy instantly. (No offline service worker yet.)

## Available Scripts
```bash
npm run dev         # Dev server
npm run build       # Production build
npm run start       # Serve a production build locally
npm run lint        # ESLint
npm run clean       # Delete .next + node_modules/.cache (fixes stale-cache dev errors)
npm run dev:clean   # clean, then dev
```

## Deploying to Production
See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for Netlify + Supabase + the reminder-cron setup
(all free tiers). Business requirements: [requirements.md](requirements.md).

## Roles
| Role | Can do | Sees |
|------|--------|------|
| **rep** | Create sales (proposes the plan; collects no money) | Own sales |
| **supervisor** | Confirm installation date, collect down payment, approve/amend sales | Own + their reps |
| **manager** | Everything a supervisor does, across their supervisors + reports | Own + supervisors + their reps |
| **admin** (MD) | Everything + user management + config | All |
| **finance** | Confirm payments; reports | All |
| **support** | Read-only | All |
