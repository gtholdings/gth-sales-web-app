import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase';
import logger from './logger';

/**
 * withAuth middleware for API routes.
 *
 * Extracts Bearer token from Authorization header, verifies with Supabase Auth,
 * fetches user profile, and validates status and role.
 *
 * Usage in API routes:
 *   export const GET = withAuth(['any'], async (req, { user, supabaseAdmin, params }) => {
 *     const { id } = await params; // for dynamic [id] routes
 *     // handler code
 *   });
 *
 * @param {string | string[]} allowedRoles - Array of roles allowed, or 'any' to bypass role check
 * @param {Function} handler - Async handler receiving (request, { user, supabaseAdmin, params })
 * @returns {Function} - Next.js API route handler
 */
export const withAuth = (allowedRoles, handler) => {
  return async (request, context) => {
    // A short label for every log line from this request, e.g. "POST /api/sales".
    const route = `${request.method} ${new URL(request.url).pathname}`;
    const startedAt = Date.now();

    try {
      logger.debug('Request received', { route });

      // Extract Authorization header
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('401 missing/invalid Authorization header', { route });
        return NextResponse.json(
          { error: 'Missing or invalid Authorization header' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token with Supabase Auth
      const {
        data: { user: authUser },
        error: authError,
      } = await supabaseAdmin.auth.getUser(token);

      if (authError || !authUser) {
        logger.warn('401 invalid or expired token', { route, reason: authError?.message });
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // Fetch user profile from profiles table
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileError || !profile) {
        logger.warn('401 profile not found', {
          route,
          userId: authUser.id,
          reason: profileError?.message,
        });
        return NextResponse.json(
          { error: 'User profile not found' },
          { status: 401 }
        );
      }

      // Check if user status is active
      if (profile.status !== 'active') {
        logger.warn('403 account not active', { route, userId: profile.id, status: profile.status });
        return NextResponse.json(
          { error: 'User account is not active' },
          { status: 403 }
        );
      }

      // Check if user role is allowed
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      if (!roles.includes('any') && !roles.includes(profile.role)) {
        logger.warn('403 insufficient permissions', {
          route,
          userId: profile.id,
          role: profile.role,
          allowed: roles,
        });
        return NextResponse.json(
          { error: 'Insufficient permissions for this action' },
          { status: 403 }
        );
      }

      // Merge auth user with profile data for handler
      const user = {
        ...authUser,
        ...profile,
      };

      logger.debug('Authorized', { route, userId: user.id, role: user.role });

      // Call handler with user, supabaseAdmin, and the Next route context
      // (context.params is a Promise in Next 15 — handlers must await it).
      const response = await handler(request, { user, supabaseAdmin, params: context?.params });
      logger.info('Request completed', {
        route,
        userId: user.id,
        status: response?.status,
        ms: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      logger.error('Auth middleware exception', { route, message: error.message, stack: error.stack });
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
};
