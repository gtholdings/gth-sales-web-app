import { withAuth } from '@/lib/auth-middleware';
import { toLocalMobile, toAuthEmail, PHONE_FORMAT_HINT } from '@/lib/phone';
import { isValidRole } from '@/lib/roles';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/admin/users
 * Admin only — list all profiles, each enriched with `reports_to_name`
 * (the full name of their hierarchy parent) for display.
 *
 * Response: { users: [...], total: number }
 */
export const GET = withAuth(['admin'], async (request, { supabaseAdmin }) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 1000);
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data: profiles, error, count } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Resolve reports_to -> full name. Most parents are already in the page; fetch
    // any that aren't so the column never shows a blank for an out-of-page parent.
    const nameById = new Map((profiles || []).map((p) => [p.id, p.full_name]));
    const missing = [...new Set((profiles || []).map((p) => p.reports_to).filter((id) => id && !nameById.has(id)))];
    if (missing.length) {
      const { data: parents } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', missing);
      for (const p of parents || []) nameById.set(p.id, p.full_name);
    }
    const users = (profiles || []).map((p) => ({
      ...p,
      reports_to_name: p.reports_to ? nameById.get(p.reports_to) || null : null,
    }));

    return NextResponse.json({ users, total: count || 0 }, { status: 200 });
  } catch (error) {
    logger.error('Fetch users error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * POST /api/admin/users
 * Admin only — create a user directly ACTIVE (no pending/approval step).
 * Body: { full_name, phone, password, role, email?, reports_to? }
 * Login id is the phone (synthetic email under the hood, like register).
 */
export const POST = withAuth(['admin'], async (request, { supabaseAdmin }) => {
  try {
    const body = await request.json();
    const { full_name, phone, password, role, email, reports_to } = body;

    if (!full_name?.trim() || !phone || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields: full_name, phone, password, role' }, { status: 400 });
    }
    if (!isValidRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    const localPhone = toLocalMobile(phone);
    const authEmail = toAuthEmail(phone);
    if (!localPhone || !authEmail) {
      return NextResponse.json({ error: `Invalid phone number. ${PHONE_FORMAT_HINT}` }, { status: 400 });
    }

    // Create the auth user (active login immediately; email_confirm so it never blocks).
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail, password, email_confirm: true,
    });
    if (authError) {
      // A duplicate login (same phone) surfaces here as an "already registered" auth error.
      const dup = /already|registered|exists/i.test(authError.message || '');
      return NextResponse.json(
        { error: dup ? 'That phone number is already in use.' : (authError.message || 'Failed to create user') },
        { status: dup ? 409 : 400 }
      );
    }

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.user.id,
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        full_name: full_name.trim(),
        phone: localPhone,
        role,
        reports_to: reports_to || null,
        status: 'active', // admin-created users skip the pending gate
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id); // roll back the auth user
      const dup = pErr.code === '23505';
      logger.warn('Admin create user: profile insert failed', { reason: pErr.message, code: pErr.code });
      return NextResponse.json(
        { error: dup ? 'That phone or email is already in use.' : 'Failed to create user profile' },
        { status: dup ? 409 : 500 }
      );
    }

    logger.info('Admin created user', { userId: profile.id, role: profile.role });
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    logger.error('Admin create user error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
