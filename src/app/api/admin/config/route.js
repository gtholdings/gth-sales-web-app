import { withAuth } from '@/lib/auth-middleware';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * PUT /api/admin/config
 * Protected endpoint (admin only) - upserts app configuration
 *
 * Headers: Authorization: Bearer {token}
 *
 * Body: {
 *   key: string (required) - configuration key
 *   value: any (required) - configuration value (can be any JSON type)
 * }
 *
 * Response: {
 *   key: string
 *   value: any
 *   created_at: string
 *   updated_at: string
 * }
 */
export const PUT = withAuth(['admin'], async (request, { supabaseAdmin }) => {
  try {
    const body = await request.json();
    const { key, value } = body;

    // Validate required fields
    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: key, value' },
        { status: 400 }
      );
    }

    // Upsert config (try to update, if no match, insert)
    const { data: existingConfig, error: selectError } = await supabaseAdmin
      .from('app_config')
      .select('*')
      .eq('key', key)
      .single();

    let result;
    let error;

    if (existingConfig) {
      // Update existing config
      const response = await supabaseAdmin
        .from('app_config')
        .update({
          value,
          updated_at: new Date().toISOString(),
        })
        .eq('key', key)
        .select()
        .single();

      result = response.data;
      error = response.error;
    } else {
      // Insert new config
      const response = await supabaseAdmin
        .from('app_config')
        .insert({
          key,
          value,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      result = response.data;
      error = response.error;
    }

    if (error) {
      return NextResponse.json(
        { error: 'Failed to save configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error('Update config error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
