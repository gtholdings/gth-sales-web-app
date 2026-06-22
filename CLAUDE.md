# CLAUDE.md — GTH Sales project memory

> Auto-loaded by Claude Code each session. Keep it concise and current. Git
> history is the authoritative changelog; this is the orientation + gotchas.

## What this is
GTH Sales — a Next.js 15 PWA for Global Tech Holdings (Sri Lanka Dialog TV
dealer). Field reps capture installment/full sales on phones; team leads,
managers, finance, and admin manage them via a web dashboard. All free tiers ($0).

**Stack:** Next.js 15.5.19 (App Router, JS not TS) · React 18 · Supabase
(Postgres + Auth) · Tailwind · Resend (email) · Winston (logging) · exceljs +
date-fns (reports). Deployed on **Netlify** (Node 22). PWA dep present
(`@ducanh2912/next-pwa`) but **not wired into `next.config.mjs`** (inactive).

## Commands
- `npm run dev` — dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run clean` — delete `.next` + `node_modules/.cache` (fixes stale-cache errors)
- `npm run dev:clean` — clean then dev
- `npm run lint`

## Architecture & hard rules
- **No RLS.** All access control is in the API layer via `withAuth()` +
  `scope-query.js`. The app uses the Supabase **secret key** (`supabaseAdmin`)
  for ALL data access (bypasses RLS). If RLS gets enabled by accident, disable:
  `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;`
- **Supabase keys (2025+ format):** publishable (`sb_publishable_`, public, safe
  in client) + secret (`sb_secret_`, server-only). No anon/service_role.
- **`withAuth(roles, handler)`** ([src/lib/auth-middleware.js](src/lib/auth-middleware.js))
  passes `(request, { user, supabaseAdmin, params })`. In Next 15 **`params` is a
  Promise** — `const { id } = await params`. Roles: `'any'` allows any
  authenticated active user; admin is NOT auto-bypassed in the API (list roles
  explicitly). Logs request lifecycle + auth failures with reason.
- **Scope** ([src/lib/scope-query.js](src/lib/scope-query.js)): `getVisibleRepIds`
  → `'*'` for admin/finance/support, `[self]` rep, `[self,...reps]` team_lead,
  `[self,...tls,...reps]` manager (walks `profiles.reports_to`). `scopeSalesQuery`
  applies `.in('rep_id', ids)`.
- **Login = mobile phone, not email** (`07XXXXXXXX`, strict). Implemented over
  Supabase email+password using a **synthetic email** `<phone>@phone.gthsales.local`
  ([src/lib/phone.js](src/lib/phone.js) `toAuthEmail`) because the native Supabase
  phone provider is **disabled** (would need SMS). Real email is optional, stored
  in `profiles.email` for comms only. Users created via `admin.createUser` with
  `email_confirm: true` (bypasses the dashboard "Confirm email" toggle).

## Recurring gotchas (learned the hard way)
- **API response keys must match what the client reads.** Several bugs came from
  routes returning `{ data }` while the client read `{ sales }`/`{ users }`/
  `{ team_leads }` etc. Convention: return a **named key** matching the consumer.
- **Migrations run manually** in the Supabase SQL editor (no DDL via the client).
  `003_installment_workflow.sql` has a **STEP 1 (`ALTER TYPE … ADD VALUE`) that
  must run on its own first**, then STEP 2 — Postgres forbids using a new enum
  value in the same transaction. When the editor prompts about RLS, click plain
  **Run** (we don't use RLS).
- **Netlify ETARGET on transitive deps:** floating ranges grab the newest version
  and Netlify's npm mirror lags. Pinned via `overrides` in package.json:
  `nanoid@3.3.12`, `@types/node@22.15.0` (jest-worker wants `@types/node@*`).
  If a new one appears, pin it the same way to a slightly older, propagated version.
- **`.next` corruption** (`Cannot find module './NNN.js'`): caused by mixing
  `next build` and `next dev` in the same `.next`, interrupted builds, or two dev
  servers. Fix: `npm run clean`. Don't run `build` then `dev` without cleaning.
- **Netlify secret scan** flags `NEXT_PUBLIC_*` (inlined into client by design).
  Whitelisted via `SECRETS_SCAN_OMIT_KEYS` in `netlify.toml`; the var should be
  marked **non-secret** in Netlify and set for **all deploy contexts**.

## Data model (Supabase) — see supabase/migrations/00{1,2,3}
- `profiles(id→auth.users, full_name, email?, phone UNIQUE NOT NULL, role
  [rep|team_lead|manager|admin|finance|support], reports_to→profiles, status
  [pending|active|inactive])`. Phone is the login id (002).
- `dialog_tv_sales(rep_id, customer_*, payment_type [full|installment],
  total_amount, num_installments, installment_amount, base_amount, first_due_date,
  approved_by/at, status [pending|approved|rejected|completed], notes)`.
- `installments(sale_id, installment_number (0 = base/down-payment, is_base=true),
  amount, paid_amount, due_date, paid_date, status
  [pending|awaiting_confirmation|paid|overdue|defaulted], claimed_by/at,
  confirmed_by/at, finance_note)`. **Created at APPROVAL** (003 dropped the old
  auto-create-on-insert triggers).
- `payment_events(sale_id, installment_id?, event_type
  [comment|claim|confirm|reject|approve_sale|reject_sale|mark_defaulted],
  author_id, note, amount, created_at)` — audit trail (author + timestamp).
- `app_config(key, value jsonb)` — incl. `default_days_threshold` (30, overdue→
  defaulted), `reminder_days_before` (7), `overdue_days_after` (1),
  `notification_recipients_finance`.
- `notification_log(...)` — email/notify audit, `channel` supports future SMS/WhatsApp.

## Feature areas
- **Approval + installments:** [api/sales/[id]/approve](src/app/api/sales/[id]/approve/route.js)
  takes installment count + base amount + first due date → generates base (row 0)
  + monthly schedule (cents-exact split, [src/lib/installments.js](src/lib/installments.js)).
- **Payment workflow:** claim (any in-scope) → `awaiting_confirmation` → finance
  confirm/reject. Routes under `api/sales/[id]/installments/[installmentId]/{claim,confirm}`
  and `api/sales/[id]/comments`. Detail UI: [src/app/sales/[id]/page.js](src/app/sales/[id]/page.js).
- **Reminders:** [src/lib/notify.js](src/lib/notify.js) (channel-agnostic, email via
  Resend, SMS/WhatsApp stubs) + secured [api/cron/installment-reminders](src/app/api/cron/installment-reminders/route.js)
  (`x-cron-secret` header == `CRON_SECRET`). Triggered daily by
  `.github/workflows/installment-reminders.yml` (needs repo secrets `APP_URL`,
  `CRON_SECRET`). Marks overdue/defaulted, emails staff (rep+TL+manager+finance).
  Customer notices deferred. Dates computed in `Asia/Colombo` ([src/lib/datetime.js](src/lib/datetime.js)).
- **Reports:** [src/lib/reports.js](src/lib/reports.js) (ranges MTD/last_month/last_90/
  custom, month/week grouping, scope-intersecting filters) + [src/lib/excel.js](src/lib/excel.js)
  (exceljs). Routes `api/sales/reports` (keeps legacy `stats` + new `report`),
  `…/reports/defaulters`, `…/reports/export` (xlsx). UI: [src/app/reports/page.js](src/app/reports/page.js).

## Env vars (.env.local / Netlify)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public),
`SUPABASE_SECRET_KEY` (secret), `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`,
`CRON_SECRET` (must match GitHub secret), `LOG_LEVEL` (optional).

## Git / deploy
- Personal GitHub: `git@github-personal:gtholdings/gth-sales-web-app.git`
  (SSH host alias `github-personal` → personal key; repo-local identity
  `supunbula <betel123@gmail.com>`). Commit on `main`, push when asked.
- Existing admin account migrated to phone login `0768971679`.

## Status / pending
- ✅ **Migrations 001–003 applied** to Supabase (RLS off). All three schema
  migrations are live, including the installment workflow + `payment_events`.
- ✅ **Netlify deploy succeeded** — env vars set; site builds and deploys green.
- ⏳ **Not yet verified end-to-end against the live DB.** The installment/
  payment/reports features are built, build-clean, and the schema is now applied,
  but the full workflow (approve→schedule→claim→finance-confirm→reminders→reports)
  hasn't been exercised against production data yet. Ask Claude to run the E2E
  verification when ready.
- ⏳ **Reminder cron:** confirm GitHub repo secrets `APP_URL` + `CRON_SECRET` are
  set (matching Netlify's `CRON_SECRET`) and the daily workflow runs.
- Known transitive audit note: 2 moderate from `uuid` under exceljs (not exploitable here).
```
