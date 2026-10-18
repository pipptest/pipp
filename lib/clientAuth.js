import { cookies } from 'next/headers';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db';
import { sign, unsign } from './crypto';

// Logins for clients (labels and artists). Pages log in through Instagram instead.
const scryptAsync = promisify(scrypt);
const COOKIE = 'pipp_client';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const key = await scryptAsync(password, Buffer.from(salt, 'base64url'), 64);
  const expected = Buffer.from(hash, 'base64url');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export async function startClientSession(clientId) {
  (await cookies()).set(COOKIE, sign('client:' + clientId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endClientSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentClient() {
  const value = unsign((await cookies()).get(COOKIE)?.value);
  if (!value || !value.startsWith('client:')) return null;
  const sql = await db();
  const [client] = await sql`select id, email, name from clients where id = ${value.slice(7)}`;
  return client || null;
}
