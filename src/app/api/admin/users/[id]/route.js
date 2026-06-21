import { withAuth } from '@/lib/auth-middleware';
import { NextResponse } from 'next/server';

/**
 * PATCH /api/admin/users/[id]
 * Protected endpoint (admin only) - updates user profile
 *
 * Headers: Authorization: Bearer {token}
 * Params: id (user ID)
 *
 * Body: {
 *   status: string (optional) - 'active', 'pending', 'inactive'
 *   role: string (optional) - 'rep', 'team_lead', 'manager', 'admin', 'finance', 'support'
 *   reports_to: string (optional) - UUID of reporting manager, or null
 * }
 *
 * Response: {
 *   id: string
 *   email: string
 *   full_name: string
 *   status: string (updated)
 *   role: string (updated)
 *   reports_to: string | null (updated)
 *   ...
 * }
 */
export const PATCH = withAuth(['admin'], async (request, { supabaseAdmin }) => {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    const body = await request.json();
    const { status, role, reports_to } = body;

    // Validate user ID
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user ID' },
        { status: 400 }
      );
    }

    // Check that at least one field is being updated
    if (status === undefined && role === undefined && reports_to === undefined) {
      return NextResponse.json(
        { error: 'At least one field must be provided: status, role, or reports_to' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData = { updated_at: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;
    if (role !== undefined) updateData.role = role;
    if (reports_to !== undefined) updateData.reports_to = reports_to;

    // Update profile
    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      );
    }

    if (!updatedProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedProfile, { status: 200 });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
