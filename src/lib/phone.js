/**
 * Sri Lankan mobile phone helpers.
 *
 * Login identifier policy (decided with the product owner):
 *   - Users log in with their mobile number, NOT email.
 *   - We accept ONLY the local 10-digit format: 07 followed by 8 digits
 *     (e.g. 0771234567). Spaces and dashes in input are tolerated.
 *   - Landlines, +94/94 prefixes, and anything not matching 07XXXXXXXX
 *     are rejected.
 *
 * Storage policy:
 *   - profiles.phone stores the human-friendly LOCAL form: 07XXXXXXXX.
 *   - Supabase Auth needs E.164, so we normalize to +947XXXXXXXX ONLY when
 *     calling Supabase (createUser / signInWithPassword).
 */

// Local SL mobile: 07 + 8 digits = 10 digits total.
const LOCAL_MOBILE_RE = /^07\d{8}$/;

/**
 * Strip spaces and dashes from raw user input.
 * @param {string} input
 * @returns {string}
 */
const stripFormatting = (input) => String(input ?? '').replace(/[\s-]/g, '');

/**
 * Validate + return the canonical LOCAL form (07XXXXXXXX), or null if invalid.
 * @param {string} input
 * @returns {string|null}
 */
export const toLocalMobile = (input) => {
  const cleaned = stripFormatting(input);
  return LOCAL_MOBILE_RE.test(cleaned) ? cleaned : null;
};

/**
 * True if the input is a valid SL mobile in the strict 07XXXXXXXX format.
 * @param {string} input
 * @returns {boolean}
 */
export const isValidLKMobile = (input) => toLocalMobile(input) !== null;

/**
 * Convert a valid local mobile to E.164 for Supabase Auth (+947XXXXXXXX),
 * or null if the input is not a valid 07XXXXXXXX number.
 *   0771234567 -> +94771234567
 * @param {string} input
 * @returns {string|null}
 */
export const toE164 = (input) => {
  const local = toLocalMobile(input);
  return local ? `+94${local.slice(1)}` : null;
};

/**
 * Internal domain for the synthetic auth email derived from a phone number.
 * `.local` is reserved (RFC 6762) and non-routable — these addresses are
 * NEVER emailed; they exist only so Supabase Auth (email+password) can use the
 * phone as the login identifier without enabling the SMS phone provider.
 */
const AUTH_EMAIL_DOMAIN = 'phone.gthsales.local';

/**
 * Map a phone number to its deterministic Supabase Auth login email.
 *   0771234567 -> 0771234567@phone.gthsales.local
 * Returns null if the input is not a valid 07XXXXXXXX number.
 *
 * This is an INTERNAL auth identifier, not a contactable address. A user's
 * real (optional) email for communications is stored separately in profiles.email.
 * @param {string} input
 * @returns {string|null}
 */
export const toAuthEmail = (input) => {
  const local = toLocalMobile(input);
  return local ? `${local}@${AUTH_EMAIL_DOMAIN}` : null;
};

/** Human-readable rule, for error messages and UI hints. */
export const PHONE_FORMAT_HINT =
  'Enter a 10-digit Sri Lankan mobile number starting with 07 (e.g. 0771234567).';
