import { withAuth } from '@/lib/auth-middleware';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/config
 * Protected endpoint - returns all app configuration
 *
 * Headers: Authorization: Bearer {token}
 *
 * Response: {
 *   data: [
 *     {
 *       key: string
 *       value: any
 *       created_at: string
 *       updated_at: string
 *     }
 *   ]
 * }
 */
export const GET = withAuth(['any'], async (request, { supabaseAdmin }) => {
  try {
    const { data: config, error } = await supabaseAdmin
      .from('app_config')
      .select('*')
      .order('key', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: config || [] }, { status: 200 });
  } catch (error) {
    logger.error('Fetch config error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
