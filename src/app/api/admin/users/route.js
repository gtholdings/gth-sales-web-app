import { withAuth } from '@/lib/auth-middleware';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/admin/users
 * Protected endpoint (admin only) - returns list of all profiles
 *
 * Headers: Authorization: Bearer {token}
 * Query params: limit (default 50), offset (default 0)
 *
 * Response: {
 *   data: [
 *     {
 *       id: string
 *       email: string
 *       full_name: string
 *       phone: string
 *       role: string
 *       status: string
 *       reports_to: string | null
 *       created_at: string
 *       updated_at: string
 *     }
 *   ],
 *   total: number
 * }
 */
export const GET = withAuth(['admin'], async (request, { supabaseAdmin }) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data: profiles, error, count } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        users: profiles || [],
        total: count || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Fetch users error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
