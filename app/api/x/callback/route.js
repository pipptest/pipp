import { checkState, connectError, saveAndSignIn } from '../../../../lib/link';
import { accountKey } from '../../../../lib/platforms';
import { exchangeCode, getMe } from '../../../../lib/x';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  if (params.get('error')) return connectError(request, 'denied', 'x');
  const verifier = request.cookies.get('pipp_x_verifier')?.value;
  if (!params.get('code') || !verifier || !checkState(request)) return connectError(request, 'state', 'x');

  try {
    const t = await exchangeCode(request, params.get('code'), verifier);
    const me = await getMe(t.accessToken);
    return await saveAndSignIn(request, {
      key: accountKey('x', me.id),
      platform: 'x',
      username: me.username,
      display_name: me.name,
      account_type: me.subscription_type ?? null,
      followers_count: me.public_metrics?.followers_count,
      media_count: me.public_metrics?.tweet_count,
      profile_picture_url: me.profile_image_url,
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresAt,
      scopes: t.scopes,
    });
  } catch (err) {
    console.error('X connect failed:', err.message);
    return connectError(request, /credits/.test(err.message) ? 'x_credits' : 'exchange', 'x');
  }
}
