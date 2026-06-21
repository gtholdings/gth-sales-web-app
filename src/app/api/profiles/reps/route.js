import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';

/**
 * GET /api/profiles/reps
 * Public endpoint - returns active sales reps (for report filter dropdowns).
 * Response: { reps: [{ id, full_name, email }] }
 */
export const GET = async () => {
  try {
    const { data: reps, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'rep')
      .eq('status', 'active')
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch reps' }, { status: 500 });
    }
    return NextResponse.json({ reps: reps || [] }, { status: 200 });
  } catch (error) {
    logger.error('Fetch reps error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
};
