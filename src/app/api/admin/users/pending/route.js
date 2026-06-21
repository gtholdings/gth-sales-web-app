import { withAuth } from '@/lib/auth-middleware';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/admin/users/pending
 * Protected endpoint (admin only) - returns list of pending user profiles
 *
 * Headers: Authorization: Bearer {token}
 *
 * Response: {
 *   users: [
 *     {
 *       id: string
 *       email: string
 *       full_name: string
 *       phone: string
 *       role: string
 *       status: 'pending'
 *       reports_to: string | null
 *       created_at: string
 *       updated_at: string
 *     }
 *   ]
 * }
 */
export const GET = withAuth(['admin'], async (request, { supabaseAdmin }) => {
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch pending users' },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: profiles || [] }, { status: 200 });
  } catch (error) {
    logger.error('Fetch pending users error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
