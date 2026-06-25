import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted, SECRET_CONFIG_KEYS } from '@/lib/crypto';

const KEY = 'test-encryption-key-do-not-use-in-prod';

describe('crypto (config secret encryption)', () => {
  let savedKey, savedSecret;
  beforeEach(() => {
    savedKey = process.env.CONFIG_ENCRYPTION_KEY;
    savedSecret = process.env.SUPABASE_SECRET_KEY;
    process.env.CONFIG_ENCRYPTION_KEY = KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.CONFIG_ENCRYPTION_KEY; else process.env.CONFIG_ENCRYPTION_KEY = savedKey;
    if (savedSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = savedSecret;
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plain = 'abcd efgh ijkl mnop'; // looks like a Gmail app password
    const enc = encryptSecret(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('uses a fresh IV so the same plaintext encrypts differently each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
    // ...but both still decrypt back to the original
    expect(decryptSecret(encryptSecret('same'))).toBe('same');
  });

  it('passes empty/null/undefined through unchanged', () => {
    expect(encryptSecret('')).toBe('');
    expect(encryptSecret(null)).toBe(null);
    expect(encryptSecret(undefined)).toBe(undefined);
  });

  it('does not double-encrypt an already-encrypted value', () => {
    const enc = encryptSecret('secret');
    expect(encryptSecret(enc)).toBe(enc);
  });

  it('returns plaintext/legacy values unchanged on decrypt', () => {
    expect(decryptSecret('plain-legacy-password')).toBe('plain-legacy-password');
    expect(decryptSecret('')).toBe('');
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted(123)).toBe(false);
  });

  it('returns "" when ciphertext is tampered (GCM auth fails)', () => {
    const enc = encryptSecret('topsecret');
    const tampered = enc.slice(0, -4) + (enc.endsWith('A') ? 'B==' : 'A==');
    expect(decryptSecret(tampered)).toBe('');
  });

  it('degrades to plaintext when no key is configured', () => {
    delete process.env.CONFIG_ENCRYPTION_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    expect(encryptSecret('nokey')).toBe('nokey');
    // an encrypted value can't be decrypted without a key → returned as-is
    process.env.CONFIG_ENCRYPTION_KEY = KEY;
    const enc = encryptSecret('x');
    delete process.env.CONFIG_ENCRYPTION_KEY;
    expect(decryptSecret(enc)).toBe(enc);
  });

  it('falls back to SUPABASE_SECRET_KEY when CONFIG_ENCRYPTION_KEY is absent', () => {
    delete process.env.CONFIG_ENCRYPTION_KEY;
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fallback';
    expect(decryptSecret(encryptSecret('viaFallback'))).toBe('viaFallback');
  });

  it('marks smtp_app_password as a secret key', () => {
    expect(SECRET_CONFIG_KEYS.has('smtp_app_password')).toBe(true);
    expect(SECRET_CONFIG_KEYS.has('smtp_user')).toBe(false);
  });
});
