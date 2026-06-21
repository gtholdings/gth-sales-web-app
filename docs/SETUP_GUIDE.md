# GTH Sales — Deployment Guide

## What You'll Have Running

A single Next.js PWA deployed on Netlify that serves:
- **Mobile app** for reps (install to home screen via Chrome/Safari)
- **Web dashboard** for managers, admin, and finance (Chrome)
- **API backend** as Next.js API routes (serverless on Netlify)
- **Database + Auth** on Supabase (Postgres + JWT authentication)
- **Email notifications** via Resend

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

Go to **Settings → API** in the Supabase dashboard. You'll need three values:

| Value | Where to find it | Env variable |
|-------|-------------------|--------------|
| **Project URL** | Settings → API → URL | `NEXT_PUBLIC_SUPABASE_URL` |
| **Publishable key** | Settings → API → Publishable key (starts with `sb_publishable_`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **Secret key** | Settings → API → Secret keys (starts with `sb_secret_`) | `SUPABASE_SECRET_KEY` |

> **Note**: Supabase replaced the legacy "anon" and "service_role" keys in 2025. New projects use Publishable and Secret keys. If you see the old `anon`/`service_role` keys in your dashboard, those are legacy — use the new ones instead.

> **Warning**: The Secret key has full database access. Never expose it in frontend code.

### About IPv6 and connection pooling

Supabase's direct Postgres host is **IPv6-only**. This does NOT affect our app because `@supabase/supabase-js` communicates via HTTP/REST (not a direct Postgres connection).

However, if you ever need a **direct Postgres connection** (e.g., for Prisma, database migrations, or CLI tools), use the **Session Pooler** connection string:
1. Go to **Settings → Database → Connection string**
2. Select **Session mode** (port 5432, IPv4-compatible)
3. Copy the connection string — it looks like: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

Do NOT use the direct connection URL for those tools — it will fail on most IPv4 networks.

---

## Step 2: Run the Database Migration

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the file `supabase/migrations/001_schema.sql` from this project
4. Copy-paste the entire contents into the SQL editor
5. Click **"Run"**
6. You should see "Success. No rows returned" — this means all tables, indexes, and triggers were created

### Verify tables were created

Go to **Table Editor** in Supabase. You should see:
- `profiles`
- `dialog_tv_sales`
- `installments`
- `notification_log`
- `app_config` (with 3 seed rows)

---

## Step 3: Configure Supabase Auth

1. In Supabase dashboard → **Authentication** → **Providers**
2. Ensure **Email** provider is enabled (it should be by default)
3. Go to **Authentication** → **Settings**
4. For MVP, you may want to **disable "Confirm email"** so users can register without email verification:
   - Toggle off "Enable email confirmations"
   - This makes testing easier. Re-enable for production.

---

## Step 4: Set Up Resend (Email Notifications)

1. Go to [resend.com](https://resend.com) and create a free account
2. For MVP: you can use their test domain (`onboarding@resend.dev`)
3. For production: add and verify your domain (e.g., `globaltechholdings.lk`)
4. Go to **API Keys** → Create a new API key
5. Save the API key — you'll need it as `RESEND_API_KEY`

---

## Step 5: Push to GitHub

1. Create a new GitHub repository (e.g., `gth-sales`)
2. Initialize and push:

```bash
cd global-tech-holdings
git init
git add .
git commit -m "Initial commit: GTH Sales MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gth-sales.git
git push -u origin main
```

Make sure `.env.local` is in `.gitignore` (never commit secrets).

---

## Step 6: Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) and sign up / log in
2. Click **"Add new site"** → **"Import an existing project"**
3. Connect your GitHub account and select the `gth-sales` repository
4. Build settings (should auto-detect from `netlify.toml`):
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
5. **Before deploying**, add environment variables:

   Go to **Site configuration** → **Environment variables** → **Add a variable**

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-id.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your publishable key (`sb_publishable_...`) |
   | `SUPABASE_SECRET_KEY` | Your secret key (`sb_secret_...`) |
   | `RESEND_API_KEY` | Your Resend API key |
   | `NOTIFICATION_FROM_EMAIL` | `noreply@yourdomain.com` or `onboarding@resend.dev` |

6. Click **"Deploy"**
7. Wait for the build to complete (~2-3 minutes)
8. Your app will be live at `https://your-site-name.netlify.app`

### Custom domain (optional)

In Netlify → **Domain settings** → **Add a custom domain**
Point your domain's DNS to Netlify. Free SSL is included.

---

## Step 7: Create the First Admin Account

This is a one-time manual step since there's no admin yet to approve registrations.

### Option A: Via the app + Supabase dashboard

1. Visit your app URL and register with any role
2. In Supabase → **Table Editor** → `profiles`
3. Find your row, edit:
   - Set `role` to `admin`
   - Set `status` to `active`
4. Log in again — you now have full admin access

### Option B: Via Supabase SQL

```sql
-- After registering via the app, run this to make yourself admin:
UPDATE profiles
SET role = 'admin', status = 'active'
WHERE email = 'your-email@example.com';
```

---

## Step 8: Onboard Users

### For Managers and Team Leads

1. Share the app URL
2. They register and select their role
3. Admin approves them in the Admin panel (or directly in Supabase)

### For Reps (Mobile PWA Installation)

Send reps these instructions:

**Android (Chrome):**
1. Open `https://your-site.netlify.app` in Chrome
2. Tap the three-dot menu (⋮) → **"Add to Home screen"**
3. Tap **"Add"**
4. The app icon now appears on your home screen

**iPhone (Safari):**
1. Open `https://your-site.netlify.app` in Safari
2. Tap the Share button (⬆) → **"Add to Home Screen"**
3. Tap **"Add"**
4. The app icon now appears on your home screen

> The app opens full-screen without browser bars, just like a native app.
> Updates are automatic — when you deploy a new version, reps get it on next open.

---

## Project Structure Reference

```
global-tech-holdings/
├── package.json                    # Dependencies and scripts
├── next.config.mjs                 # Next.js configuration
├── tailwind.config.js              # Tailwind CSS theme
├── netlify.toml                    # Netlify deployment config
├── public/
│   └── manifest.json               # PWA manifest
├── src/
│   ├── app/
│   │   ├── layout.js               # Root layout with AuthProvider
│   │   ├── page.js                 # Root → redirects to login/dashboard
│   │   ├── login/page.js           # Login page
│   │   ├── register/page.js        # Registration with role selection
│   │   ├── dashboard/page.js       # Sales overview (role-scoped)
│   │   ├── sales/new/page.js       # New Dialog TV sale form
│   │   ├── admin/page.js           # User management (admin only)
│   │   ├── reports/page.js         # Sales reports (manager/admin/finance)
│   │   └── api/                    # Backend API routes
│   │       ├── auth/register/      # POST: user registration
│   │       ├── auth/login/         # POST: login, get JWT
│   │       ├── sales/              # GET: list, POST: create
│   │       ├── sales/[id]/approve/ # PATCH: approve/reject
│   │       ├── sales/reports/      # GET: aggregated stats
│   │       ├── admin/users/        # GET: all users
│   │       ├── admin/users/pending/# GET: pending registrations
│   │       ├── admin/users/[id]/   # PATCH: update user
│   │       └── admin/config/       # PUT: update settings
│   ├── lib/
│   │   ├── supabase.js             # Supabase client setup
│   │   ├── auth-middleware.js       # withAuth() role-based middleware
│   │   └── scope-query.js          # Data scoping per role
│   ├── components/
│   │   ├── Navbar.jsx              # Responsive navigation
│   │   ├── SalesForm.jsx           # Dialog TV sale input form
│   │   ├── SalesTable.jsx          # Sales data table
│   │   ├── StatsCards.jsx          # Dashboard summary cards
│   │   └── ProtectedRoute.jsx      # Route guard by role
│   └── contexts/
│       └── AuthContext.js           # Auth state management
├── supabase/
│   └── migrations/
│       └── 001_schema.sql           # Database tables and triggers
└── docs/
    ├── ARCHITECTURE.md              # Technical architecture
    └── SETUP_GUIDE.md               # This file
```

---

## Free Tier Capacity

| Service | Limit | Your Usage (200 reps, ~50 sales/day) |
|---------|-------|--------------------------------------|
| **Supabase** | 500MB database | ~1MB/year at 50 records/day |
| **Supabase** | 50k monthly active users | ~200 users |
| **Supabase** | Unlimited API requests | Lightweight usage |
| **Netlify** | 100GB bandwidth/month | ~2GB/month for 200 users |
| **Netlify** | 125k serverless function calls/month | ~3k/month (200 users × 15 calls/day) |
| **Resend** | 3,000 emails/month | ~1,500/month (50 sales × 30 days) |

You won't come close to any of these limits for years.

---

## Troubleshooting

### "Account not active" after login
The admin needs to approve the account. Go to Admin panel or Supabase Table Editor → set `status` to `active`.

### Emails not sending
Check the Resend dashboard for delivery logs. For testing, use `onboarding@resend.dev` as the from address.

### Build fails on Netlify
Make sure all environment variables are set in Netlify → Site configuration → Environment variables.

### PWA not installing on iPhone
Make sure you're using Safari (not Chrome on iOS). The "Add to Home Screen" option is only in Safari's share menu.
