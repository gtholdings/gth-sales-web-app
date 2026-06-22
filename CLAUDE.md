# CLAUDE.md — GTH Sales project memory

> Auto-loaded by Claude Code each session. Keep it concise and current. Git
> history is the authoritative changelog; this is the orientation + gotchas.

## What this is
GTH Sales — a Next.js 15 PWA for Global Tech Holdings (Sri Lanka Dialog TV
dealer). Reps capture installment sales on phones; **supervisors**, managers,
finance, and admin manage them via a web dashboard. Bilingual **English/Sinhala**.
All free tiers ($0).

**Stack:** Next.js 15.5.19 (App Router, JS not TS) · React 18 · Supabase
(Postgres + Auth) · Tailwind · Resend (email) · Winston (logging) · exceljs +
date-fns (reports). Deployed on **Netlify** (Node 22). PWA dep present but not
wired into `next.config.mjs` (inactive).

## Commands
- `npm run dev` / `npm run build`
- `npm run clean` — delete `.next` + `node_modules/.cache` (fixes stale-cache `Cannot find module './NNN.js'`)
- `npm run dev:clean` — clean then dev · `npm run lint`

## Architecture & hard rules
- **No RLS.** All access control in the API via `withAuth()` + `scope-query.js`,
  using the Supabase **secret key** (`supabaseAdmin`, bypasses RLS). Disable RLS if
  accidentally enabled: `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;`
- **Supabase keys (2025+):** publishable (`sb_publishable_`, public) + secret
  (`sb_secret_`, server-only).
- **`withAuth(roles, handler)`** → `(request, { user, supabaseAdmin, params })`;
  `params` is a Promise in Next 15 (`await params`). `'any'` = any active user;
  admin is NOT auto-bypassed in the API (list roles explicitly).
- **Roles:** `rep, supervisor, manager, admin, finance, support` ("supervisor"
  replaced the old "team_lead" everywhere incl. the DB enum). Hierarchy via
  `profiles.reports_to`: rep → supervisor → manager → admin.
- **Scope** ([scope-query.js](src/lib/scope-query.js)): `getVisibleRepIds` → `'*'`
  for admin/finance/support, `[self]` rep, `[self,...reps]` supervisor,
  `[self,...supervisors,...reps]` manager. `scopeSalesQuery` applies `.in('rep_id', ids)`.
- **Login = mobile phone** (`07XXXXXXXX`, strict), implemented over Supabase
  email+password via a synthetic email `<phone>@phone.gthsales.local`
  ([phone.js](src/lib/phone.js) `toAuthEmail`) — native phone provider is disabled.
  Email optional (comms only). Users created via `admin.createUser({email_confirm:true})`.
- **Money:** always `Rs. 1,234.56` via [formatRs](src/lib/format.js). Never Intl currency.
- **i18n:** [LanguageContext](src/contexts/LanguageContext.js) `useT()` → `t('key', {vars})`;
  dictionaries [src/lib/i18n/{en,si}.js](src/lib/i18n/en.js); `<LanguageSwitcher/>` in the
  Navbar + login/register. Persisted in localStorage, no locale routing. Noto Sans
  Sinhala font in [layout.js](src/app/layout.js) + Tailwind `sans` stack. Dates/amounts
  are NOT translated; Sinhala data entry works natively (Unicode TEXT columns).

## Sale lifecycle (core business rules)
- **Reps never collect money.** The rep records the sale + a **proposed plan**
  (total, down payment, # installments, **proposed down-payment date**); status `pending`.
- A **supervisor/manager** confirms a technician **installation date** (offline),
  then on the approve screen enters it as the **down-payment date**, and may amend
  the down-payment **date, amount, and # installments**. Approving = collecting the
  down payment → generates the schedule. **Any change vs the rep's `proposed_*` is
  logged as an `amend` event** (shown in the activity timeline).
- **Schedule:** down payment (installment 0) is due on the down-payment date and is
  created **claimed (awaiting_confirmation)** by the supervisor; installment k (1..N)
  is due `addMonths(downPaymentDate, k)` — same day-of-month, **clamped to month-end**
  when missing (Jan 31→Feb 28; May 31→Jun 30). See [installments.js](src/lib/installments.js).
- **Finance** confirms each payment against the bank (claim → confirm/reject).
- Every sale is an installment plan (no full-payment toggle in the form).

## Data model — single consolidated [001_schema.sql](supabase/migrations/001_schema.sql)
(Drops + recreates everything; replaced the old 001/002/003. Run once, plain "Run", no RLS.)
- `profiles(id→auth.users, full_name, email?, phone NOT NULL UNIQUE ^07\d{8}$, role,
  reports_to, status)`.
- `dialog_tv_sales(rep_id, customer_*, payment_type, total_amount, base_amount,
  num_installments, installment_amount, down_payment_date, proposed_base_amount,
  proposed_num_installments, proposed_down_payment_date, status, approved_by/at, notes)`.
- `installments(sale_id, installment_number (0=base, is_base), amount, paid_amount,
  due_date, paid_date, status [pending|awaiting_confirmation|paid|overdue|defaulted],
  claimed_by/at, confirmed_by/at, finance_note)`. Created at APPROVAL (no triggers).
- `payment_events(sale_id, installment_id?, event_type
  [comment|claim|confirm|reject|approve_sale|reject_sale|mark_defaulted|amend],
  author_id, note, amount, created_at)` — audit trail.
- `app_config` keys: default_installment_count, installment_options,
  notification_recipients_finance, default_days_threshold(30), reminder_days_before(7),
  overdue_days_after(1). `notification_log` for email/notify audit.

## Feature areas
- **New sale form** ([SalesForm.jsx](src/components/SalesForm.jsx)): Customer + Payment
  sections, auto Loan/Monthly, schedule preview from the proposed down-payment date.
- **Approval/amendment** ([approve route](src/app/api/sales/[id]/approve/route.js)) +
  **detail page** ([sales/[id]](src/app/sales/[id]/page.js)): claim/confirm/comment +
  activity timeline; routes `…/installments/[id]/{claim,confirm}`, `…/comments`, `GET …/[id]`.
- **Reminders:** [notify.js](src/lib/notify.js) + secured [cron route](src/app/api/cron/installment-reminders/route.js)
  (`x-cron-secret`), daily via `.github/workflows/installment-reminders.yml` (secrets `APP_URL`, `CRON_SECRET`).
- **Reports:** [reports.js](src/lib/reports.js) + [excel.js](src/lib/excel.js); routes
  `…/reports`, `…/reports/defaulters`, `…/reports/export`; filter dropdowns from
  `/api/profiles/{supervisors,managers,reps}`.

## Recurring gotchas
- **API response keys must match the client** (return named keys: `{ sales }`,
  `{ users }`, `{ supervisors }` …) — silent empty lists otherwise.
- **Migration runs manually** in the Supabase SQL editor (no DDL via the client).
  The consolidated `001_schema.sql` is a single Run (no ALTER-TYPE ordering issue).
  Click plain **Run** (no RLS).
- **Netlify ETARGET**: floating transitive versions lag Netlify's mirror — pinned via
  `overrides`: `nanoid@3.3.12`, `@types/node@22.15.0`. Pin new offenders the same way.
- **`.next` corruption**: `npm run clean` (don't run `build` then `dev` without cleaning).
- **Netlify secret scan**: `NEXT_PUBLIC_*` whitelisted via `SECRETS_SCAN_OMIT_KEYS` in netlify.toml.

## Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public),
`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `CRON_SECRET`, `LOG_LEVEL?`.

## Git / deploy
- `git@github-personal:gtholdings/gth-sales-web-app.git` (SSH alias `github-personal`
  → personal key; repo-local identity `supunbula <betel123@gmail.com>`). Commit on `main`.
- Admin account: phone `0768971679`.

## Status / pending
- ✅ Consolidated `001_schema.sql` applied; `auth.users` cleared for a clean reset.
- ✅ **E2E verified against the live DB** (21/21): phone login (all roles), rep proposal →
  supervisor amend+approve (amend event captures old→new), date clamp (Jan 31 → Feb 28 /
  Mar 31 / Apr 30), cents-exact split, down-payment auto-claim → finance confirm,
  installment claim→confirm, detail, reports, defaulters. Sinhala data entry persisted fine.
- ⏳ Admin re-seed: register `0768971679` via the app, then
  `UPDATE profiles SET role='admin', status='active' WHERE phone='0768971679';`
- ⏳ Manual UI pass for the EN⇄SI toggle in a browser (logic verified by build).
- See [requirements.md](requirements.md) for the consolidated business requirements (SRS).
