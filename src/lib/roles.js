// Canonical list of user roles (must match the `user_role` DB enum).
// Used to validate client-supplied roles server-side so a request can't set an
// arbitrary/elevated role on a profile (SAST C1: privilege escalation).
export const USER_ROLES = ['rep', 'supervisor', 'manager', 'admin', 'credit_officer', 'field_officer'];

// Roles a user may pick during OPEN self-registration. 'admin' is excluded so a
// self-registrant cannot self-assign admin (an approving admin could otherwise
// activate it unknowingly). New accounts are still created `pending` regardless.
export const SELF_REGISTER_ROLES = USER_ROLES.filter((r) => r !== 'admin');

export const isValidRole = (role) => USER_ROLES.includes(role);
export const isSelfRegisterRole = (role) => SELF_REGISTER_ROLES.includes(role);
