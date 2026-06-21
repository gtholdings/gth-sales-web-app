import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

    // Create auth user via admin API
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });

    if (authError) {
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
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      );
    }

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
    console.error('Register error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
