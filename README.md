# GTH Sales — Global Tech Holdings Sales Management

A Progressive Web App for managing field sales operations. Reps capture Dialog TV sales on their phones, and managers, finance, and admin track everything via the web dashboard.

Built with Next.js 14, Supabase (Postgres + Auth), Tailwind CSS, and Resend. Deployed on Netlify. All free tiers — $0/month.

## Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **A Supabase account** — [supabase.com](https://supabase.com) (free)
- **A Resend account** — [resend.com](https://resend.com) (free, for email notifications)

## Local Development Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd global-tech-holdings
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose **Singapore** region (closest to Sri Lanka)
3. Save the database password

### 3. Run the database migration

1. In Supabase dashboard → **SQL Editor** → **New query**
2. Paste the contents of `supabase/migrations/001_schema.sql`
3. Click **Run**
4. Verify in **Table Editor** that these tables exist: `profiles`, `dialog_tv_sales`, `installments`, `notification_log`, `app_config`

### 4. Disable email confirmations (for local dev)

In Supabase → **Authentication** → **Sign In / Providers** → under **Auth Providers** click **Email** → toggle off **"Confirm email"** → **Save**.

> Supabase moved this setting. It used to live under _Authentication → Settings_; it's now in the **Email** provider config. If your dashboard shows a different layout, look for the **Email** provider (Authentication → **Providers**) and the **Confirm email** toggle.

This lets you register and login without email verification during development.

### 5. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase keys (find them at **Settings → API** in the Supabase dashboard):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxx

RESEND_API_KEY=re_xxxxxxxx
NOTIFICATION_FROM_EMAIL=onboarding@resend.dev
```

> **Note on keys**: Supabase now uses **Publishable** keys (replaces legacy "anon" key) and **Secret** keys (replaces legacy "service_role" key). New projects only have the new format. If your project still shows the old keys, use the new ones from the API settings page.

> **Resend**: For local dev, you can use `onboarding@resend.dev` as the from address without domain verification.

### 6. Start the dev server

```bash
npm run dev
```

The app will be running at [http://localhost:3000](http://localhost:3000).

### 7. Create your first admin account

1. Open [http://localhost:3000/register](http://localhost:3000/register)
2. Fill in the form, choose any role, and submit
3. Your account will be in `pending` status — you need to manually activate it:

**Option A** — In Supabase dashboard → **Table Editor** → `profiles` → find your row → set `role` to `admin` and `status` to `active`

**Option B** — In Supabase → **SQL Editor**, run:

```sql
UPDATE profiles
SET role = 'admin', status = 'active'
WHERE email = 'your-email@example.com';
```

4. Go back to [http://localhost:3000/login](http://localhost:3000/login) and log in — you now have full admin access.

### 8. Test the workflow

1. **As admin**: Go to the Admin page, you can approve users and manage settings
2. **Register a team lead**: Register a new account with role "Team Lead", then approve it from the admin panel
3. **Register a rep**: Register with role "Rep" and select the team lead from the dropdown, then approve
4. **Log in as the rep**: Navigate to "New Sale" to create a Dialog TV sale
5. **Log in as the team lead**: You should see the rep's sale on the dashboard with approve/reject buttons

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── layout.js               # Root layout (AuthProvider, fonts)
│   │   ├── page.js                 # Redirect → login or dashboard
│   │   ├── login/page.js           # Login page
│   │   ├── register/page.js        # Registration (role + hierarchy)
│   │   ├── dashboard/page.js       # Sales overview (role-scoped)
│   │   ├── sales/new/page.js       # Dialog TV sale capture form
│   │   ├── admin/page.js           # User management (admin only)
│   │   ├── reports/page.js         # Sales reports
│   │   └── api/                    # API routes (backend)
│   │       ├── auth/{login,register}/
│   │       ├── sales/              # CRUD + approve + reports
│   │       ├── admin/              # User mgmt + config
│   │       ├── profile/            # Current user
│   │       ├── profiles/           # Team lead / manager lists
│   │       └── config/             # App settings
│   ├── lib/
│   │   ├── supabase.js             # Supabase clients (publishable + secret)
│   │   ├── auth-middleware.js       # withAuth(['role']) middleware
│   │   └── scope-query.js          # Role-based data filtering
│   ├── components/
│   │   ├── Navbar.jsx              # Responsive nav (role-based links)
│   │   ├── SalesForm.jsx           # Dialog TV sale input form
│   │   ├── SalesTable.jsx          # Sales data table + approve/reject
│   │   ├── StatsCards.jsx          # Dashboard summary cards
│   │   └── ProtectedRoute.jsx      # Route guard by role
│   └── contexts/
│       └── AuthContext.js           # Auth state (token, user, login/logout)
├── supabase/migrations/
│   └── 001_schema.sql               # DB tables, triggers (no RLS)
├── public/manifest.json              # PWA manifest
├── docs/
│   ├── ARCHITECTURE.md              # Technical architecture details
│   └── SETUP_GUIDE.md              # Production deployment guide (Netlify + Supabase)
├── .env.local.example               # Environment variable template
├── netlify.toml                     # Netlify deployment config
├── next.config.mjs
├── tailwind.config.js
└── package.json
```

## Key Architecture Decisions

**No RLS** — All access control is in the API layer via `withAuth()` middleware and `scopeQuery()`. This makes it easy to add exceptions (e.g., give a specific rep access to a specific endpoint) without database migrations.

**PWA instead of native app** — Reps visit the URL in Chrome/Safari and tap "Add to Home Screen." No APK distribution, no app store. Updates deploy instantly.

**Supabase new key format** — Uses Publishable keys (`sb_publishable_`) and Secret keys (`sb_secret_`) instead of the deprecated anon/service_role keys.

**No direct Postgres connection** — The app uses `@supabase/supabase-js` which communicates over HTTP/REST, avoiding the IPv6-only issue with Supabase's direct Postgres host. If you ever need a direct connection (Prisma, CLI tools), use the Session Pooler URL from Supabase Dashboard → Settings → Database → Session mode.

## Available Scripts

```bash
npm run dev       # Start development server (http://localhost:3000)
npm run build     # Production build
npm run start     # Start production server locally
npm run lint      # Run ESLint
```

## Deploying to Production

See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for step-by-step instructions to deploy on Netlify + Supabase (all free tiers).

## Roles

| Role | Can do | Sees |
|------|--------|------|
| **rep** | Create sales | Own sales only |
| **team_lead** | View + approve/reject sales | Own + their reps' sales |
| **manager** | View + approve + reports | Own + team leads + their reps |
| **admin** (MD) | Everything + user management + config | All data |
| **finance** | Reports (read-only) | All data |
| **support** | Support (read-only) | All data |
