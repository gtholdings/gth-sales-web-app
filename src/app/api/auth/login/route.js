import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';

/**
 * POST /api/auth/login
 * Public endpoint - authenticates user and returns tokens
 *
 * Body: {
 *   email: string (required)
 *   password: string (required)
 * }
 *
 * Response: {
 *   token: string (access token)
 *   refresh_token: string
 *   user: {
 *     id: string
 *     email: string
 *     full_name: string
 *     role: string
 *     status: string
 *   }
 * }
 */
export const POST = async (request) => {
  try {
    const body = await request.json();
    const { email, password } = body;

    // NOTE: never log the password.
    logger.debug('Login attempt received', { email, hasPassword: Boolean(password) });

    // Validate required fields
    if (!email || !password) {
      logger.warn('Login rejected: missing fields', {
        email: Boolean(email),
        password: Boolean(password),
      });
      return NextResponse.json(
        { error: 'Missing required fields: email, password' },
        { status: 400 }
      );
    }

    // Sign in with email and password
    const { data, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Surface the REAL reason — e.g. "Invalid login credentials",
      // "Email not confirmed", rate limiting, etc. This is the most
      // common source of a login 401.
      logger.warn('Login 401: Supabase sign-in failed', {
        email,
        reason: signInError.message,
        code: signInError.code,
        status: signInError.status,
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
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
        email,
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
