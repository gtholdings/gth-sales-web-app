import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds, scopeSalesQuery } from '@/lib/scope-query';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/sales
 * Protected endpoint - returns sales list with scope filtering
 *
 * Headers: Authorization: Bearer {token}
 * Query params: limit (default 50), offset (default 0)
 *
 * Response: {
 *   data: [
 *     {
 *       id: string
 *       rep_id: string
 *       customer_name: string
 *       nic_number: string
 *       permanent_address: string
 *       personal_phone: string
 *       office_phone: string | null
 *       total_amount: number
 *       payment_type: string | null
 *       num_installments: number
 *       notes: string | null
 *       status: string
 *       created_at: string
 *       updated_at: string
 *       rep: {
 *         full_name: string
 *         email: string
 *       }
 *       installments: []
 *     }
 *   ],
 *   total: number
 * }
 */
export const GET = withAuth(['any'], async (request, { user, supabaseAdmin }) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get visible rep IDs based on user's role
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);

    // Build query with scope filtering
    let query = supabaseAdmin
      .from('dialog_tv_sales')
      .select(
        `
        *,
        rep:profiles!rep_id(full_name, email),
        installments(*)
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply scope filter
    query = scopeSalesQuery(query, visibleRepIds);

    const { data: sales, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch sales' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        data: sales || [],
        total: count || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Fetch sales error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/sales
 * Protected endpoint (rep only) - creates new sale
 *
 * Headers: Authorization: Bearer {token}
 *
 * Body: {
 *   customer_name: string (required)
 *   nic_number: string (required)
 *   permanent_address: string (required)
 *   personal_phone: string (required)
 *   total_amount: number (required)
 *   office_phone: string (optional)
 *   payment_type: string (optional) - 'cash', 'installment', 'other'
 *   num_installments: number (optional)
 *   notes: string (optional)
 * }
 *
 * Response: {
 *   id: string
 *   rep_id: string
 *   customer_name: string
 *   ...
 * }
 */
export const POST = withAuth(['rep'], async (request, { user, supabaseAdmin }) => {
  try {
    const body = await request.json();
    const {
      customer_name,
      nic_number,
      permanent_address,
      personal_phone,
      total_amount,
      office_phone,
      payment_type,
      num_installments,
      notes,
    } = body;

    // Validate required fields
    if (
      !customer_name ||
      !nic_number ||
      !permanent_address ||
      !personal_phone ||
      typeof total_amount !== 'number' ||
      total_amount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'Missing or invalid required fields: customer_name, nic_number, permanent_address, personal_phone, total_amount',
        },
        { status: 400 }
      );
    }

    // Create sale record
    const { data: sale, error } = await supabaseAdmin
      .from('dialog_tv_sales')
      .insert({
        rep_id: user.id,
        customer_name,
        nic_number,
        permanent_address,
        personal_phone,
        office_phone: office_phone || null,
        total_amount,
        payment_type: payment_type || null,
        num_installments: num_installments || null,
        notes: notes || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create sale' },
        { status: 500 }
      );
    }

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    logger.error('Create sale error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
