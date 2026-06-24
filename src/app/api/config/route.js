import { withAuth } from '@/lib/auth-middleware';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

// Only the non-sensitive plan settings the client (sales form / useAppConfig)
// needs. Admin-only settings (SMTP, thresholds, recipients) are NOT exposed
// here — the Settings page reads those from the admin-only GET /api/admin/config.
const PUBLIC_KEYS = ['installment_interest_percent', 'max_installments'];

/**
 * GET /api/config
 * Any authenticated user — returns ONLY the public plan config (PUBLIC_KEYS).
 *
 * Response: { data: [{ key, value }] }
 */
export const GET = withAuth(['any'], async (request, { supabaseAdmin }) => {
  try {
    const { data: config, error } = await supabaseAdmin
      .from('app_config')
      .select('key, value')
      .in('key', PUBLIC_KEYS)
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
