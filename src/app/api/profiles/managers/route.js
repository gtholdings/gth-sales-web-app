import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/profiles/managers
 * Public endpoint - returns list of active managers (for dropdowns, etc)
 *
 * Response: {
 *   data: [
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
    const { data: managers, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'manager')
      .eq('status', 'active')
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch managers' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: managers || [] }, { status: 200 });
  } catch (error) {
    console.error('Fetch managers error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
