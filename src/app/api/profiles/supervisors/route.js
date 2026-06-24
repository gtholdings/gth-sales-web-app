import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';

/**
 * GET /api/profiles/supervisors
 * Public endpoint - returns list of active supervisors (for dropdowns, etc)
 *
 * Response: {
 *   supervisors: [
 *     {
 *       id: string
 *       full_name: string
 *       email: string
 *     }
 *   ]
 * }
 */
export const GET = async () => {
  try {
    const { data: supervisors, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'supervisor')
      .eq('status', 'active')
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch supervisors' },
        { status: 500 }
      );
    }

    return NextResponse.json({ supervisors: supervisors || [] }, { status: 200 });
  } catch (error) {
    logger.error('Fetch supervisors error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
