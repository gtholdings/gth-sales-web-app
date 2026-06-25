import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption-at-rest for sensitive app_config values (e.g. the Gmail App
 * Password). Stored values are AES-256-GCM ciphertext, so a direct DB read (or a
 * backup dump) shows only ciphertext; the app decrypts using a key held ONLY in
 * the server environment — never in the database.
 *
 * Key source (server-only): CONFIG_ENCRYPTION_KEY if set, else derived from
 * SUPABASE_SECRET_KEY (so it works with zero extra config). Set a dedicated
 * CONFIG_ENCRYPTION_KEY in production so rotating the Supabase key doesn't make
 * existing ciphertext undecryptable.
 *
 * Format: `enc:v1:<iv b64>:<authTag b64>:<ciphertext b64>`. Plaintext / legacy
 * values (no prefix) pass through unchanged, so this is backward compatible.
 */

const PREFIX = 'enc:v1:';

// Config keys whose values are encrypted at rest + redacted from API responses.
export const SECRET_CONFIG_KEYS = new Set(['smtp_app_password']);

export const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

// 32-byte AES-256 key derived from the server secret (read per-call so tests /
// runtime env changes are honoured). Returns null when no secret is available.
function getKey() {
  const raw = process.env.CONFIG_ENCRYPTION_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

/** Encrypt a plaintext string. Empty/null and already-encrypted values are returned as-is. */
export function encryptSecret(plain) {
  if (plain == null || plain === '') return plain;
  if (isEncrypted(plain)) return plain;
  const key = getKey();
  if (!key) return plain; // no key configured → degrade to plaintext rather than lose data
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Decrypt a value produced by encryptSecret. Non-encrypted (plaintext/legacy)
 * values are returned unchanged. A tampered/undecryptable value (e.g. wrong key)
 * returns '' so callers treat it as unset rather than crashing or leaking.
 */
export function decryptSecret(value) {
  if (!isEncrypted(value)) return value;
  const key = getKey();
  if (!key) return value;
  try {
    const [ivB, tagB, ctB] = value.slice(PREFIX.length).split(':');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
