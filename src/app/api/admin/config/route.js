import { withAuth } from '@/lib/auth-middleware';
import { encryptSecret, SECRET_CONFIG_KEYS } from '@/lib/crypto';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

// Keys whose values are encrypted at rest + never returned to the client.
const SECRET_KEYS = SECRET_CONFIG_KEYS;

/**
 * GET /api/admin/config
 * Admin only — returns ALL app config for the Settings page. Secret values
 * (SECRET_KEYS) are redacted to '' and reported only as a `<key>_set` boolean,
 * so the password is never sent to the browser (Settings keeps it blank = keep).
 */
export const GET = withAuth(['admin'], async (_request, { supabaseAdmin }) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_config').select('key, value').order('key', { ascending: true });
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }
    const flags = {};
    const rows = (data || []).map((r) => {
      if (SECRET_KEYS.has(r.key)) {
        flags[`${r.key}_set`] = !!(r.value && String(r.value).length);
        return { key: r.key, value: '' };
      }
      return r;
    });
    return NextResponse.json({ data: rows, ...flags }, { status: 200 });
  } catch (error) {
    logger.error('Fetch admin config error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

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

    // Secret values (e.g. the Gmail App Password) are encrypted at rest.
    const storedValue = SECRET_KEYS.has(key) ? encryptSecret(value) : value;

    // Upsert config (try to update, if no match, insert)
    const { data: existingConfig } = await supabaseAdmin
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
          value: storedValue,
          updated_at: new Date().toISOString(),
        })
        .eq('key', key)
        .select()
        .single();

      result = response.data;
      error = response.error;
    } else {
      // Insert new config (app_config has no created_at column)
      const response = await supabaseAdmin
        .from('app_config')
        .insert({
          key,
          value: storedValue,
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

    // Never echo a secret value (ciphertext) back to the client.
    if (result && SECRET_KEYS.has(key)) result.value = '';
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error('Update config error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
