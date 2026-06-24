import { withAuth } from '@/lib/auth-middleware';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/profiles/reps
 * Active sales reps for the report filter dropdown. Unlike /supervisors and
 * /managers (public, needed by the pre-auth register page), this is only used by
 * the authenticated reports page, so it requires auth and does NOT expose emails.
 * Response: { reps: [{ id, full_name }] }
 */
export const GET = withAuth(['admin', 'supervisor', 'manager', 'credit_officer'], async (_request, { supabaseAdmin }) => {
  try {
    const { data: reps, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
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
});
