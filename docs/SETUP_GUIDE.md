# GTH Sales — Deployment Guide

## What You'll Have Running

A single Next.js PWA deployed on Netlify that serves:
- **Mobile app** for reps (install to home screen via Chrome/Safari)
- **Web dashboard** for managers, admin, and finance (Chrome)
- **API backend** as Next.js API routes (serverless on Netlify)
- **Database + Auth** on Supabase (Postgres; auth via Supabase Auth)
- **Email notifications** via Resend (installment reminders + overdue notices)
- **Daily reminder job** triggered by a free GitHub Actions cron

> **Login identifier:** users sign in with their **Sri Lankan mobile number**
> (`07XXXXXXXX`), not email. Email is optional and captured for communications only.

Total monthly cost: **$0** (all free tiers)

---

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up / log in
2. Click **"New Project"**
3. Settings:
   - **Organization**: Create one (e.g., "Global Tech Holdings")
   - **Project name**: `gth-sales`
   - **Database password**: Generate a strong one and **save it**
   - **Region**: Choose **Singapore** (closest to Sri Lanka)
4. Wait for the project to finish provisioning (~2 minutes)

### Get your Supabase keys

In the dashboard, open **Project Settings** (gear icon). The keys live on the
**API Keys** page and the URL on the **API** (Data API) page:

| Value | Where to find it | Env variable |
|-------|-------------------|--------------|
| **Project URL** | Project Settings → **API** → Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| **Publishable key** | Project Settings → **API Keys** (starts with `sb_publishable_`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **Secret key** | Project Settings → **API Keys** → Secret keys (starts with `sb_secret_`) | `SUPABASE_SECRET_KEY` |

> **Note**: Supabase replaced the legacy "anon" and "service_role" keys with
> **Publishable** and **Secret** keys. If your dashboard still shows the old
> `anon`/`service_role` keys, use the new ones. (Menu labels shift between
> Supabase releases — if you don't see "API Keys", look under Project Settings → API.)

> **Warning**: The Secret key has full database access and **bypasses RLS**.
> Never expose it in frontend code. This app uses it only server-side.

### About IPv6 and connection pooling

Supabase's direct Postgres host is **IPv6-only**. This does NOT affect our app because `@supabase/supabase-js` communicates via HTTP/REST (not a direct Postgres connection).

If you ever need a **direct Postgres connection** (Prisma, CLI tools), use the **Session Pooler** string: Project Settings → **Database** → Connection string → **Session mode** (port 5432, IPv4-compatible). Do NOT use the direct connection URL — it fails on most IPv4 networks.

---

## Step 2: Run the Database Migrations

Run the migration files in **order** in the Supabase **SQL Editor** (left sidebar → New query → paste → Run).

1. **`supabase/migrations/001_schema.sql`** — base tables, indexes, triggers.
2. **`supabase/migrations/002_phone_login.sql`** — makes **phone** the unique,
   required login identifier (`07XXXXXXXX`) and email optional.
   - ⚠️ Prerequisite: every existing `profiles` row must already have a valid
     `07XXXXXXXX` phone. On a fresh project there are no rows, so it just applies.
3. **`supabase/migrations/003_installment_workflow.sql`** — installment
   scheduling, payment claim/confirm workflow, audit trail, reminder config.
   - ⚠️ **Run order matters.** This file has a **STEP 1** (two `ALTER TYPE … ADD VALUE`
     statements) that **must be run on its own first** — Postgres forbids using a
     new enum value in the same transaction that adds it. Select only the STEP 1
     lines and Run, then select and Run the rest (STEP 2). The file is commented
     to make this clear.
   - When the SQL Editor asks about RLS, click plain **"Run"** — this app does
     **not** use RLS (access is controlled in the API via the secret key). If you
     accidentally enable it, disable with `ALTER TABLE <name> DISABLE ROW LEVEL SECURITY;`.

### Verify tables were created

Go to **Table Editor**. You should see:
- `profiles`, `dialog_tv_sales`, `installments`, `notification_log`, `app_config`
- `payment_events` (added in 003 — the audit trail)

Quick sanity check that 003's enum step applied (SQL Editor):
```sql
SELECT unnest(enum_range(NULL::installment_status));
-- expect: pending, paid, overdue, awaiting_confirmation, defaulted
```

---

## Step 3: Configure Supabase Auth

1. Dashboard → **Authentication** → **Sign In / Providers**
2. Ensure the **Email** provider is **enabled** (default). The app creates users
   server-side via the admin API with the email pre-confirmed, so you do **not**
   need to change the "Confirm email" toggle — it does not affect login.
3. You do **not** need to enable the Phone provider or any SMS provider — the app
   implements phone login over the email+password mechanism internally.

> In short: leave Auth at defaults. Login works with the mobile number + password.

---

## Step 4: Set Up Resend (Email Notifications)

1. Go to [resend.com](https://resend.com) and create a free account
2. For MVP: use their test domain sender `onboarding@resend.dev`
3. For production: add and verify your domain (e.g., `globaltechholdings.lk`)
4. **API Keys** → create a key → save it as `RESEND_API_KEY`
5. Set `NOTIFICATION_FROM_EMAIL` to your verified sender (or `onboarding@resend.dev`)

Resend powers the installment **reminder** (7 days before due) and **overdue**
notices (1 day after) sent to staff. Without a key, the app still runs; the cron
just logs the sends as failed.

---

## Step 5: Push to GitHub

If the project isn't already a Git repo:

```bash
cd global-tech-holdings
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:YOUR_ORG/gth-sales-web-app.git
git push -u origin main
```

Make sure `.env.local` is gitignored (it is) — never commit secrets.

---

## Step 6: Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) and sign up / log in
2. **Add new site** → **Import an existing project** → connect GitHub → select the repo
3. Build settings auto-detect from `netlify.toml`:
   - **Build command**: `npm run build`
   - **Node version**: pinned to **22** via `netlify.toml`
4. **Before deploying**, add environment variables (Site configuration → **Environment variables**):

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-id.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` |
   | `RESEND_API_KEY` | Your Resend API key |
   | `NOTIFICATION_FROM_EMAIL` | `noreply@yourdomain.com` or `onboarding@resend.dev` |
   | `CRON_SECRET` | A long random string (`openssl rand -hex 32`) — see Step 8 |
   | `LOG_LEVEL` | *(optional)* `info` (default) or `debug` |

5. **Deploy**. Build takes ~2–3 minutes. Live at `https://your-site-name.netlify.app`.

### Custom domain (optional)
Netlify → **Domain settings** → **Add a custom domain**. Free SSL included.

---

## Step 7: Create the First Admin Account

One-time manual step (no admin exists yet to approve registrations).

1. Visit your app URL → **Register**. Enter a **mobile number** (`07XXXXXXXX`),
   a password, full name, and pick any role. (Email is optional.)
2. Promote yourself to an active admin — Supabase **SQL Editor**:

```sql
UPDATE profiles
SET role = 'admin', status = 'active'
WHERE phone = '0771234567';   -- the mobile number you registered with
```

3. Log in with that **mobile number + password** — you now have full admin access.

> (Alternatively, edit the row in Table Editor: set `role = admin`, `status = active`.)

---

## Step 8: Enable the Daily Reminder Job (GitHub Actions)

The installment reminder/overdue cron lives at `/api/cron/installment-reminders`
and is protected by a shared secret. A scheduled GitHub Actions workflow
(`.github/workflows/installment-reminders.yml`) calls it daily.

1. Pick a secret: `openssl rand -hex 32`. **Use the same value** in Netlify
   (`CRON_SECRET`, Step 6) and in GitHub below.
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**, add two:
   - `APP_URL` = your Netlify URL (e.g. `https://your-site.netlify.app`, no trailing slash)
   - `CRON_SECRET` = the same secret you put in Netlify
3. Redeploy Netlify so its `CRON_SECRET` env var is live.
4. Test: GitHub → **Actions** → **Installment Reminders** → **Run workflow**, or:
   ```bash
   curl -i -X POST "$APP_URL/api/cron/installment-reminders" -H "x-cron-secret: $CRON_SECRET"
   ```
   A `200` + JSON summary = working. It then runs automatically each morning.

> Platform-agnostic alternative: cron-job.org — schedule a daily POST to the same
> URL with a custom header `x-cron-secret: <secret>`.

---

## Step 9: Onboard Users

### Managers / Team Leads / Finance
1. Share the app URL; they register with their **mobile number** and role.
2. Admin approves them in the **Admin** panel — and can set their role and
   reporting supervisor (team lead for reps, manager for team leads) at approval time.

### Reps (Mobile PWA Installation)
**Android (Chrome):** open the URL → three-dot menu (⋮) → **Add to Home screen** → **Add**.
**iPhone (Safari):** open the URL → Share (⬆) → **Add to Home Screen** → **Add**.

> Opens full-screen like a native app. Updates deploy automatically.

---

## Day-to-day flow (what the app now does)

1. **Rep** records a Dialog TV sale (status `pending`).
2. **Team Lead / Manager / Admin** opens the sale and **approves** it — entering
   the number of installments, the base/down-payment already paid, and the first
   due date. The app generates the down-payment + a **monthly** installment schedule.
3. Anyone in scope can **mark a payment paid**; it goes to **Finance** to confirm
   against the bank (or reject). Every action is logged with author + timestamp.
4. The daily cron emails **7-day reminders** and **1-day overdue notices** to the
   rep + team lead + manager + finance, and flags overdue/defaulted installments.
5. **Reports** (Reports tab): filter by range (MTD / last month / last 90 / custom),
   group by month/week, filter by manager/team-lead/rep; see paid / pending /
   defaulted totals and a **defaulter list**, with **Excel export**. Defaulted
   amounts are attributed to the rep (threshold configurable in admin, default 30 days).

---

## Project Structure Reference

```
global-tech-holdings/
├── package.json · next.config.mjs · tailwind.config.js · netlify.toml · jsconfig.json
├── .github/workflows/installment-reminders.yml   # daily reminder cron trigger
├── public/manifest.json                          # PWA manifest
├── src/
│   ├── app/
│   │   ├── layout.js · page.js
│   │   ├── login/ · register/ · dashboard/ · admin/ · reports/
│   │   ├── sales/page.js                         # sales list
│   │   ├── sales/new/page.js                     # new sale form
│   │   ├── sales/[id]/page.js                     # sale detail: schedule, payments, audit
│   │   └── api/
│   │       ├── auth/{login,register}/            # phone + password
│   │       ├── sales/  (GET list, POST create)
│   │       ├── sales/[id]/  (GET detail)
│   │       ├── sales/[id]/approve/  (POST: approve+schedule / reject)
│   │       ├── sales/[id]/comments/  (POST)
│   │       ├── sales/[id]/installments/[installmentId]/{claim,confirm}/  (POST)
│   │       ├── sales/reports/  ·  sales/reports/defaulters/  ·  sales/reports/export/ (xlsx)
│   │       ├── cron/installment-reminders/        # secured daily job
│   │       ├── admin/users/ · admin/users/pending/ · admin/users/[id]/ · admin/config/
│   │       ├── profiles/{managers,team-leads,reps}/   # filter/dropdown lists
│   │       └── profile/ · config/
│   ├── lib/
│   │   ├── supabase.js · auth-middleware.js · scope-query.js · logger.js
│   │   ├── installments.js · datetime.js          # schedule math, Asia/Colombo tz
│   │   ├── notify.js                              # channel-agnostic email (+ SMS/WhatsApp stubs)
│   │   ├── reports.js · excel.js                  # reporting + xlsx export
│   │   └── phone.js                               # 07XXXXXXXX validation / login mapping
│   ├── components/  Navbar · SalesForm · SalesTable · StatsCards · ProtectedRoute · InstallmentStatusBadge
│   └── contexts/AuthContext.js
├── supabase/migrations/
│   ├── 001_schema.sql · 002_phone_login.sql · 003_installment_workflow.sql
└── docs/  ARCHITECTURE.md · SETUP_GUIDE.md
```

---

## Free Tier Capacity

| Service | Limit | Usage (200 reps, ~50 sales/day) |
|---------|-------|--------------------------------------|
| **Supabase** | 500MB DB · 50k MAU · unlimited API | ~1MB/year · ~200 users |
| **Netlify** | 100GB bandwidth · 125k function calls/mo | ~2GB · ~3k/mo |
| **Resend** | 3,000 emails/month | reminders + notices, well within limit |
| **GitHub Actions** | 2,000 min/mo (private) | 1 short job/day |

---

## Troubleshooting

### Can't log in / "Invalid phone number or password"
Log in with the **mobile number** (`07XXXXXXXX`), not email. Check the server logs
(Winston) — they print the real reason (wrong credentials, account not active, etc.).

### "Account not active" after login
Admin must approve the account (Admin panel) or set `status = 'active'` in Supabase.

### Migration 003 errored on the enum
You ran the whole file at once. Run only the two `ALTER TYPE … ADD VALUE` lines
first, then run the rest. See Step 2.

### Reminders not sending
Confirm `CRON_SECRET` matches in Netlify **and** GitHub, the site was redeployed,
and `RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` are set. Check the Actions run log
and Resend delivery logs.

### Build fails on Netlify
Ensure all environment variables (Step 6) are set, including `CRON_SECRET`.

### PWA not installing on iPhone
Use **Safari** (not Chrome on iOS); "Add to Home Screen" is in Safari's share menu.
```
