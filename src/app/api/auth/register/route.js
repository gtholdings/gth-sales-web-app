import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';

/**
 * POST /api/auth/register
 * Public endpoint - creates new auth user and profile
 *
 * Body: {
 *   email: string (required)
 *   password: string (required)
 *   full_name: string (required)
 *   phone: string (required)
 *   role: string (required) - 'rep', 'team_lead', 'manager', 'admin', 'finance', 'support'
 *   reports_to: string (optional) - UUID of reporting manager
 * }
 *
 * Response: {
 *   id: string (user ID)
 *   email: string
 *   full_name: string
 *   status: 'pending'
 * }
 */
export const POST = async (request) => {
  try {
    const body = await request.json();
    const { email, password, full_name, phone, role, reports_to } = body;

    // Validate required fields
    if (!email || !password || !full_name || !phone || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, full_name, phone, role' },
        { status: 400 }
      );
    }

    // Create auth user via admin API.
    // NOTE: admin.createUser bypasses the dashboard "Confirm email" provider
    // toggle — that setting only governs the public signUp flow. We must set
    // email_confirm explicitly here, or the user is created unconfirmed and
    // login fails with "Email not confirmed". This app has no email-link
    // verification step; the real access gate is profiles.status (set to
    // 'pending' below and approved by an admin), so we auto-confirm the email.
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      logger.warn('Register failed: createUser error', { email, reason: authError.message });
      return NextResponse.json(
        { error: authError.message || 'Failed to create user' },
        { status: 400 }
      );
    }

    // Create profile with pending status
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.user.id,
        email,
        full_name,
        phone,
        role,
        reports_to: reports_to || null,
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
        email,
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
        email: profile.email,
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
