/**
 * Scope Query Service
 *
 * Handles access control by determining which rep IDs a user can view based on their role.
 * This is the app-level access control (since we have NO RLS).
 */

/**
 * Get list of rep IDs visible to the current user based on their role.
 *
 * - admin/finance/support → '*' (can see all)
 * - rep → [user.id] (can only see their own)
 * - team_lead → [user.id, ...reps reporting to them]
 * - manager → [user.id, ...team_leads reporting to them, ...reps under those TLs]
 *
 * @param {Object} user - User object with id and role
 * @param {*} supabaseAdmin - Supabase admin client
 * @returns {Promise<string | string[]>} - '*' for all access, or array of rep UUIDs
 */
export const getVisibleRepIds = async (user, supabaseAdmin) => {
  const { id: userId, role } = user;

  // Admin, finance, support can see all reps
  if (['admin', 'finance', 'support'].includes(role)) {
    return '*';
  }

  // Rep can only see their own data
  if (role === 'rep') {
    return [userId];
  }

  // Team lead can see themselves and reps reporting to them
  if (role === 'team_lead') {
    const { data: reps, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('reports_to', userId)
      .eq('role', 'rep');

    if (error) {
      console.error('Error fetching team lead subordinates:', error);
      return [userId];
    }

    return [userId, ...(reps?.map((r) => r.id) || [])];
  }

  // Manager can see themselves, team leads reporting to them, and reps under those TLs
  if (role === 'manager') {
    // Fetch team leads reporting to this manager
    const { data: teamLeads, error: tlError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('reports_to', userId)
      .eq('role', 'team_lead');

    if (tlError) {
      console.error('Error fetching manager team leads:', tlError);
      return [userId];
    }

    const teamLeadIds = teamLeads?.map((tl) => tl.id) || [];

    // Fetch reps reporting to those team leads
    const { data: reps, error: repsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('reports_to', teamLeadIds)
      .eq('role', 'rep');

    if (repsError) {
      console.error('Error fetching manager subordinate reps:', repsError);
      return [userId, ...teamLeadIds];
    }

    const repIds = reps?.map((r) => r.id) || [];
    return [userId, ...teamLeadIds, ...repIds];
  }

  // Default fallback: only see own ID
  return [userId];
};

/**
 * Apply scope filtering to a sales query.
 *
 * If visibleIds is '*', no filtering is applied.
 * Otherwise, adds .in('rep_id', visibleIds) filter to the query.
 *
 * @param {Object} query - Supabase query builder object
 * @param {string | string[]} visibleIds - '*' for all, or array of rep UUIDs
 * @returns {Object} - Modified query with scope filter applied if needed
 */
export const scopeSalesQuery = (query, visibleIds) => {
  if (visibleIds === '*') {
    return query;
  }

  return query.in('rep_id', visibleIds);
};
