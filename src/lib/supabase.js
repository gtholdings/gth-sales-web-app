import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client Configuration
 * ==============================
 *
 * Uses the NEW Supabase API key format (2025+):
 *   - Publishable key (sb_publishable_xxx) — replaces legacy "anon" key
 *   - Secret key (sb_secret_xxx)           — replaces legacy "service_role" key
 *
 * The publishable key is safe to expose in frontend code.
 * The secret key must NEVER be exposed — server-side only.
 *
 * CONNECTION NOTE:
 * The @supabase/supabase-js client communicates over HTTP/REST
 * (via PostgREST), NOT via a direct Postgres connection. This means
 * the IPv6-only issue with Supabase's direct Postgres host does NOT
 * affect this client. The Supabase API URL works over both IPv4/IPv6.
 *
 * If you ever need a direct Postgres connection (e.g., Prisma, pg,
 * postgres.js), use the Session Pooler connection string from
 * Supabase Dashboard → Settings → Database → Connection string → Session mode.
 * Session pooler runs on port 5432 and is IPv4-compatible.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

// ── Validation ──────────────────────────────────────────────
if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL — set it in .env.local');
}

if (!supabasePublishableKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — ' +
    'find it in Supabase Dashboard → Settings → API → Publishable key. ' +
    'This replaces the legacy "anon" key.'
  );
}

// Secret key is only required server-side (API routes)
// Don't throw on client-side where it's intentionally absent
if (typeof window === 'undefined' && !supabaseSecretKey) {
  throw new Error(
    'Missing SUPABASE_SECRET_KEY — ' +
    'find it in Supabase Dashboard → Settings → API → Secret keys. ' +
    'This replaces the legacy "service_role" key.'
  );
}

// ── Server-side admin client ────────────────────────────────
// Uses the secret key for full database access.
// Only use this in API routes (server-side), never in client components.

export const supabaseAdmin = supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// ── Client-side browser client ──────────────────────────────
// Uses the publishable key. Safe to use in 'use client' components.
// Since we have NO RLS, this is used only for auth operations
// (login, signup, token refresh). All data queries go through
// our API routes which use supabaseAdmin.

export const createClientForBrowser = () => {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
};
