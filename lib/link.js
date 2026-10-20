import { NextResponse } from 'next/server';
import { db } from './db';
import { encrypt, randomState, sign, unsign } from './crypto';
import { siteOrigin } from './instagram';

const COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

// Starts a sign-in with a platform: remembers a one-time state (and PKCE verifier) for the return trip.
export function startLogin(url, state, extra = {}) {
  const res = NextResponse.redirect(url);
  res.cookies.set('pipp_oauth_state', state, { ...COOKIE, maxAge: 600 });
  for (const [name, value] of Object.entries(extra)) res.cookies.set(name, value, { ...COOKIE, maxAge: 600 });
  return res;
}

export { randomState };

export function connectError(request, reason, platform) {
  const res = NextResponse.redirect(`${siteOrigin(request)}/connect?error=${encodeURIComponent(reason)}${platform ? `&platform=${platform}` : ''}`);
  res.cookies.delete('pipp_oauth_state');
  res.cookies.delete('pipp_x_verifier');
  return res;
}

export function checkState(request) {
  const params = new URL(request.url).searchParams;
  const state = params.get('state');
  const expected = request.cookies.get('pipp_oauth_state')?.value;
  return Boolean(state && expected && state === expected);
}

// Saves a connected account. If this browser is already signed in to pipp, the
// account is linked to that page; otherwise it starts (or rejoins) its own page.
// Then signs the browser in and goes to /account.
export async function saveAndSignIn(request, a) {
  const sql = await db();
  const sessionKey = unsign(request.cookies.get('pipp_session')?.value);
  const [current] = sessionKey ? await sql`select owner_id from instagram_accounts where ig_user_id = ${sessionKey}` : [];
  const owner = current?.owner_id || null;

  await sql`
    insert into instagram_accounts
      (ig_user_id, platform, owner_id, username, display_name, account_type, followers_count, media_count,
       profile_picture_url, access_token_enc, refresh_token_enc, token_expires_at, scopes)
    values
      (${a.key}, ${a.platform}, coalesce(${owner}::uuid, gen_random_uuid()), ${a.username}, ${a.display_name ?? null},
       ${a.account_type ?? null}, ${a.followers_count ?? null}, ${a.media_count ?? null}, ${a.profile_picture_url ?? null},
       ${encrypt(a.accessToken)}, ${a.refreshToken ? encrypt(a.refreshToken) : null}, ${a.expiresAt ?? null}, ${a.scopes || null})
    on conflict (ig_user_id) do update set
      owner_id = coalesce(${owner}::uuid, instagram_accounts.owner_id),
      username = excluded.username,
      display_name = excluded.display_name,
      account_type = excluded.account_type,
      followers_count = excluded.followers_count,
      media_count = excluded.media_count,
      profile_picture_url = excluded.profile_picture_url,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = coalesce(excluded.refresh_token_enc, instagram_accounts.refresh_token_enc),
      token_expires_at = excluded.token_expires_at,
      scopes = excluded.scopes,
      updated_at = now()
  `;

  // A newly linked account shares the page's alert email.
  if (owner) {
    await sql`
      update instagram_accounts set email = coalesce(email, (select email from instagram_accounts where owner_id = ${owner} and email is not null limit 1))
      where ig_user_id = ${a.key}
    `;
  }

  const res = NextResponse.redirect(`${siteOrigin(request)}/account${owner ? `?linked=${a.platform}` : ''}`);
  res.cookies.delete('pipp_oauth_state');
  res.cookies.delete('pipp_x_verifier');
  res.cookies.set('pipp_session', sign(owner ? sessionKey : a.key), { ...COOKIE, maxAge: 60 * 60 * 24 * 30 });
  return res;
}
