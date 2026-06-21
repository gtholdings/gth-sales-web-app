import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';

/**
 * GET /api/profiles/team-leads
 * Public endpoint - returns list of active team leads (for dropdowns, etc)
 *
 * Response: {
 *   team_leads: [
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
    const { data: teamLeads, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'team_lead')
      .eq('status', 'active')
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch team leads' },
        { status: 500 }
      );
    }

    return NextResponse.json({ team_leads: teamLeads || [] }, { status: 200 });
  } catch (error) {
    logger.error('Fetch team leads error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
