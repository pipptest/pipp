import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { encrypt, sign } from '../../../../lib/crypto';
import { exchangeCode, getProfile, siteOrigin } from '../../../../lib/instagram';

export const dynamic = 'force-dynamic';

function fail(request, reason) {
  const res = NextResponse.redirect(siteOrigin(request) + '/connect?error=' + encodeURIComponent(reason));
  res.cookies.delete('pipp_oauth_state');
  return res;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  if (params.get('error')) return fail(request, 'denied');

  const code = params.get('code');
  const state = params.get('state');
  const expected = request.cookies.get('pipp_oauth_state')?.value;
  if (!code || !state || !expected || state !== expected) return fail(request, 'state');

  try {
    const { accessToken, expiresAt } = await exchangeCode(request, code);
    const profile = await getProfile(accessToken);
    const sql = await db();
    await sql`
      insert into instagram_accounts
        (ig_user_id, username, account_type, followers_count, media_count, profile_picture_url, access_token_enc, token_expires_at)
      values
        (${String(profile.user_id)}, ${profile.username}, ${profile.account_type ?? null}, ${profile.followers_count ?? null},
         ${profile.media_count ?? null}, ${profile.profile_picture_url ?? null}, ${encrypt(accessToken)}, ${expiresAt})
      on conflict (ig_user_id) do update set
        username = excluded.username,
        account_type = excluded.account_type,
        followers_count = excluded.followers_count,
        media_count = excluded.media_count,
        profile_picture_url = excluded.profile_picture_url,
        access_token_enc = excluded.access_token_enc,
        token_expires_at = excluded.token_expires_at,
        updated_at = now()
    `;

    const res = NextResponse.redirect(siteOrigin(request) + '/account');
    res.cookies.delete('pipp_oauth_state');
    res.cookies.set('pipp_session', sign(String(profile.user_id)), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    console.error('Instagram connect failed:', err.message);
    return fail(request, 'exchange');
  }
}
