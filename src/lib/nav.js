/**
 * Where a user lands after login / on the root route.
 * Reps go straight to the new-sale form (their main job); everyone else to the
 * dashboard.
 */
export function landingPathForRole(role) {
  return role === 'rep' ? '/sales/new' : '/dashboard';
}
