import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

    // Validate required fields
    if (!email || !password) {
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
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 401 }
      );
    }

    // Check if user status is active
    if (profile.status !== 'active') {
      return NextResponse.json(
        { error: 'User account is not active. Please contact an administrator.' },
        { status: 403 }
      );
    }

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
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
