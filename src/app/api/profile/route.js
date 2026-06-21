import { withAuth } from '@/lib/auth-middleware';

/**
 * GET /api/profile
 * Protected endpoint - returns current user's profile
 *
 * Headers: Authorization: Bearer {token}
 *
 * Response: {
 *   id: string
 *   email: string
 *   full_name: string
 *   phone: string
 *   role: string
 *   status: string
 *   reports_to: string | null
 *   created_at: string
 *   updated_at: string
 * }
 */
export const GET = withAuth(['any'], async (request, { user }) => {
  // Return the authenticated user's profile
  const { email_confirmed_at, phone_confirmed_at, phone_change_token, ...profile } = user;

  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
