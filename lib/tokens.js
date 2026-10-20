import { db } from './db';
import { decrypt, encrypt } from './crypto';

// Instagram long-lived tokens last 60 days. They can be refreshed once they are at
// least 24 hours old and not yet expired; each refresh gives another 60 days.
// Docs: https://developers.facebook.com/documentation/instagram-platform/reference/refresh_access_token
const DAY = 24 * 60 * 60 * 1000;
const LIFETIME = 60 * DAY;
const REFRESH_WHEN_LEFT = 50 * DAY; // refresh roughly every 10 days

export function needsRefresh(account, now = Date.now()) {
  if (!account?.token_expires_at || (account.platform && account.platform !== 'instagram')) return false;
  const expires = new Date(account.token_expires_at).getTime();
  const issued = expires - LIFETIME;
  return expires > now && now - issued >= DAY && expires - now < REFRESH_WHEN_LEFT;
}

// X and TikTok access is renewed on demand, so only Instagram access can lapse this way.
export function isExpired(account, now = Date.now()) {
  if (account?.platform && account.platform !== 'instagram') return false;
  return Boolean(account?.token_expires_at) && new Date(account.token_expires_at).getTime() <= now;
}

// Refreshes one account's token if it is due. Returns the up-to-date account row.
export async function refreshIfNeeded(account) {
  if (!needsRefresh(account)) return account;
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', decrypt(account.access_token_enc));
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`Token refresh failed: ${body.error?.message || res.statusText}`);
  }
  const expiresAt = new Date(Date.now() + (body.expires_in ? body.expires_in * 1000 : LIFETIME));
  const sql = await db();
  const [updated] = await sql`
    update instagram_accounts
    set access_token_enc = ${encrypt(body.access_token)}, token_expires_at = ${expiresAt}, updated_at = now()
    where ig_user_id = ${account.ig_user_id}
    returning *
  `;
  return updated || account;
}

// Refreshes every account that is due. Used by the daily scheduled job.
export async function refreshAllDue() {
  const sql = await db();
  const accounts = await sql`
    select * from instagram_accounts
    where platform = 'instagram'
      and token_expires_at is not null
      and token_expires_at > now()
      and token_expires_at < now() + interval '50 days'
  `;
  const result = { checked: accounts.length, refreshed: 0, failed: 0 };
  for (const account of accounts) {
    if (!needsRefresh(account)) continue;
    try {
      await refreshIfNeeded(account);
      result.refreshed += 1;
    } catch (err) {
      result.failed += 1;
      console.error(`Refresh failed for @${account.username}:`, err.message);
    }
  }
  return result;
}
