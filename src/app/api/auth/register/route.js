import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';
import { toLocalMobile, toAuthEmail, PHONE_FORMAT_HINT } from '@/lib/phone';
import { isSelfRegisterRole } from '@/lib/roles';

/**
 * POST /api/auth/register
 * Public endpoint - creates new auth user and profile
 *
 * Login identifier is the MOBILE PHONE (07XXXXXXXX). Email is optional and
 * captured for communications only.
 *
 * Body: {
 *   phone: string (required) - 07 followed by 8 digits (e.g. 0771234567)
 *   password: string (required)
 *   full_name: string (required)
 *   role: string (required) - 'rep', 'supervisor', 'manager', 'admin', 'credit_officer'
 *   email: string (optional) - for communications only
 *   reports_to: string (optional) - UUID of reporting manager/supervisor
 *   supervisor_id / manager_id: string (optional) - aliases for reports_to
 * }
 *
 * Response: {
 *   id: string (user ID)
 *   phone: string
 *   full_name: string
 *   status: 'pending'
 * }
 */
export const POST = async (request) => {
  try {
    const body = await request.json();
    const { email, password, full_name, phone, role, reports_to, supervisor_id, manager_id } = body;

    // Validate required fields (email is now optional)
    if (!password || !full_name || !phone || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: phone, password, full_name, role' },
        { status: 400 }
      );
    }

    // Validate the requested role against an allowlist so a self-registrant can't
    // self-assign an arbitrary/elevated role (admin is not self-registerable).
    if (!isSelfRegisterRole(role)) {
      return NextResponse.json({ error: 'Invalid role selection' }, { status: 400 });
    }

    // Validate + normalize the login phone.
    const localPhone = toLocalMobile(phone); // canonical 07XXXXXXXX, or null
    const authEmail = toAuthEmail(phone);    // synthetic login email for Supabase Auth
    if (!localPhone || !authEmail) {
      return NextResponse.json(
        { error: `Invalid phone number. ${PHONE_FORMAT_HINT}` },
        { status: 400 }
      );
    }

    const cleanEmail = typeof email === 'string' && email.trim() ? email.trim() : null;

    // The org-hierarchy parent may arrive as reports_to or as a role-specific alias.
    const parentId = reports_to || supervisor_id || manager_id || null;

    // Create the auth user via admin API. The phone is the login identifier,
    // implemented as a deterministic synthetic email (phone@phone.gthsales.local)
    // so we use Supabase's email+password auth WITHOUT enabling the SMS phone
    // provider. email_confirm:true so it never blocks login; the real access
    // gate is profiles.status (pending → admin-approved). The user's real
    // (optional) email is stored only in profiles.email, for communications.
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
    });

    if (authError) {
      logger.warn('Register failed: createUser error', { phone: localPhone, reason: authError.message });
      return NextResponse.json(
        { error: authError.message || 'Failed to create user' },
        { status: 400 }
      );
    }

    // Create profile with pending status. We store the human-friendly local
    // phone (07XXXXXXXX) here; the E.164 form lives only in Supabase Auth.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.user.id,
        email: cleanEmail,
        full_name,
        phone: localPhone,
        role,
        reports_to: parentId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profileError) {
      // Cleanup: delete the auth user if profile creation fails
      logger.error('Register failed: profile insert error, rolling back auth user', {
        userId: authUser.user.id,
        phone: localPhone,
        reason: profileError.message,
        code: profileError.code,
      });
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      );
    }

    logger.info('Register success', { userId: profile.id, role: profile.role, status: profile.status });

    return NextResponse.json(
      {
        id: profile.id,
        phone: profile.phone,
        full_name: profile.full_name,
        status: profile.status,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Register route exception', { message: error.message, stack: error.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
