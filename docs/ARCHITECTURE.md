# Global Tech Holdings - Sales Management Platform

## Architecture Overview

### Tech Stack

| Component       | Technology        | Purpose                                            | Cost        |
|-----------------|-------------------|----------------------------------------------------|-------------|
| Frontend + API  | Next.js 14 (PWA)  | Rep mobile UI, Manager dashboard, API routes       | Free        |
| Database & Auth | Supabase          | Postgres + JWT auth (no RLS — RBAC in API layer)   | Free tier   |
| Hosting         | Netlify           | Hosts Next.js app + serverless API routes           | Free tier   |
| Email           | Resend            | Transactional email notifications on new sales      | Free (3k/mo)|

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Netlify                                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Next.js PWA (Frontend)                      │  │
│  │  ┌──────────────────┐  ┌────────────────────────────┐  │  │
│  │  │  Mobile PWA UI    │  │  Web Dashboard             │  │  │
│  │  │  (Rep-facing)     │  │  (Manager/Admin/Finance)   │  │  │
│  │  └──────────────────┘  └────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │ API calls                         │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Next.js API Routes (Serverless)             │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌────────────────────────────────┐  │  │
│  │  │ withAuth()   │  │  scopeQuery()                  │  │  │
│  │  │ middleware    │→ │  "which rows for this role?"   │  │  │
│  │  │ "can you     │  │                                │  │  │
│  │  │  call this?" │  │  rep → own rows                │  │  │
│  │  └──────────────┘  │  team_lead → own + reps        │  │  │
│  │                     │  manager → own + TLs + reps   │  │  │
│  │                     │  admin → everything            │  │  │
│  │                     └────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ Secret key (full DB access)
┌──────────────────────────────────────────────────────────────┐
│                    Supabase                                   │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │   Postgres    │  │   Auth       │  No RLS.                │
│  │   (data only) │  │   (JWT)      │  API routes handle all  │
│  │              │  │              │  access control.         │
│  └──────────────┘  └──────────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

### Security Model: Two Layers in API Routes

**Layer 1 — withAuth() Middleware (endpoint access)**
```
withAuth(['rep'])                     → only reps
withAuth(['rep', 'team_lead'])        → reps or team leads
withAuth(['manager', 'admin'])        → managers or admin
withAuth(['admin'])                   → admin only (MD)
withAuth(['any'])                     → any logged-in user
```

**Layer 2 — scopeQuery() Service (data filtering)**
```
rep       → WHERE rep_id = my_id
team_lead → WHERE rep_id IN (my_id, ...my_reps)
manager   → WHERE rep_id IN (my_id, ...my_TLs, ...their_reps)
admin     → no filter (all rows)
finance   → no filter (all rows, read-only endpoints)
```

### API Route Map

| Method | Route                         | Auth                                 | Purpose                      |
|--------|-------------------------------|--------------------------------------|------------------------------|
| POST   | /api/auth/register            | public                               | New user registration        |
| POST   | /api/auth/login               | public                               | Login, get JWT               |
| GET    | /api/profile                  | withAuth(['any'])                    | Get own profile              |
| GET    | /api/profiles/team-leads      | public                               | Dropdown for registration    |
| GET    | /api/profiles/managers        | public                               | Dropdown for registration    |
| GET    | /api/config                   | withAuth(['any'])                    | Read app settings            |
| GET    | /api/sales                    | withAuth(['any']) + scope            | List sales (scoped by role)  |
| POST   | /api/sales                    | withAuth(['rep'])                    | Create new sale              |
| PATCH  | /api/sales/[id]/approve       | withAuth(['team_lead','manager','admin']) | Approve/reject sale     |
| GET    | /api/sales/reports            | withAuth(['manager','admin','finance'])   | Dashboard summary       |
| GET    | /api/admin/users              | withAuth(['admin'])                  | List all users               |
| GET    | /api/admin/users/pending      | withAuth(['admin'])                  | Pending registrations        |
| PATCH  | /api/admin/users/[id]         | withAuth(['admin'])                  | Approve/update user          |
| PUT    | /api/admin/config             | withAuth(['admin'])                  | Update app settings          |
