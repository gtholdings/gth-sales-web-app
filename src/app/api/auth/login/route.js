import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';
import { toLocalMobile, toAuthEmail, PHONE_FORMAT_HINT } from '@/lib/phone';

/**
 * POST /api/auth/login
 * Public endpoint - authenticates user (by MOBILE PHONE) and returns tokens
 *
 * Body: {
 *   phone: string (required) - 07 followed by 8 digits (e.g. 0771234567)
 *   password: string (required)
 * }
 *
 * Response: {
 *   token: string (access token)
 *   refresh_token: string
 *   user: {
 *     id: string
 *     phone: string
 *     email: string | null
 *     full_name: string
 *     role: string
 *     status: string
 *   }
 * }
 */
export const POST = async (request) => {
  try {
    const body = await request.json();
    const { phone, password } = body;

    // NOTE: never log the password.
    logger.debug('Login attempt received', { phone, hasPassword: Boolean(password) });

    // Validate required fields
    if (!phone || !password) {
      logger.warn('Login rejected: missing fields', {
        phone: Boolean(phone),
        password: Boolean(password),
      });
      return NextResponse.json(
        { error: 'Missing required fields: phone, password' },
        { status: 400 }
      );
    }

    // Validate the phone and map it to the synthetic Supabase Auth login email.
    const localPhone = toLocalMobile(phone);
    const authEmail = toAuthEmail(phone);
    if (!localPhone || !authEmail) {
      logger.warn('Login rejected: invalid phone format', { phone });
      return NextResponse.json(
        { error: `Invalid phone number. ${PHONE_FORMAT_HINT}` },
        { status: 400 }
      );
    }

    // Sign in with the phone-derived email and password
    const { data, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError) {
      // Surface the REAL reason — e.g. "Invalid login credentials",
      // "Phone not confirmed", rate limiting, etc. This is the most
      // common source of a login 401.
      logger.warn('Login 401: Supabase sign-in failed', {
        phone: localPhone,
        reason: signInError.message,
        code: signInError.code,
        status: signInError.status,
      });
      return NextResponse.json(
        { error: 'Invalid phone number or password' },
        { status: 401 }
      );
    }

    logger.debug('Supabase sign-in OK', { userId: data.user?.id });

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      logger.warn('Login 401: profile lookup failed', {
        userId: data.user?.id,
        phone: localPhone,
        reason: profileError?.message,
        code: profileError?.code,
      });
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 401 }
      );
    }

    // Check if user status is active
    if (profile.status !== 'active') {
      logger.warn('Login 403: account not active', {
        userId: profile.id,
        status: profile.status,
      });
      return NextResponse.json(
        { error: 'User account is not active. Please contact an administrator.' },
        { status: 403 }
      );
    }

    logger.info('Login success', { userId: profile.id, role: profile.role });

    return NextResponse.json(
      {
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: profile.id,
          phone: profile.phone,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          status: profile.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Login route exception', { message: error.message, stack: error.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
