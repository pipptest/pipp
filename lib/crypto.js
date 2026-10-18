import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// A server-only secret Vercel already holds. Used to encrypt stored Instagram
// tokens and to sign the session cookie, so neither needs an extra setting.
function secret(purpose) {
  const base = process.env.SUPABASE_JWT_SECRET;
  if (!base) throw new Error('SUPABASE_JWT_SECRET is not set');
  return createHash('sha256').update(purpose + ':' + base).digest();
}

export function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret('token-encryption'), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', secret('token-encryption'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function sign(value) {
  const mac = createHmac('sha256', secret('session')).update(value).digest('base64url');
  return value + '.' + mac;
}

export function unsign(signed) {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value).slice(i + 1));
  const given = Buffer.from(signed.slice(i + 1));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return value;
}

export function randomState() {
  return randomBytes(24).toString('base64url');
}
