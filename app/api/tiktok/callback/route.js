import { checkState, connectError, saveAndSignIn } from '../../../../lib/link';
import { accountKey } from '../../../../lib/platforms';
import { exchangeCode, getUser } from '../../../../lib/tiktok';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  if (params.get('error')) return connectError(request, 'denied', 'tiktok');
  if (!params.get('code') || !checkState(request)) return connectError(request, 'state', 'tiktok');

  try {
    const t = await exchangeCode(request, params.get('code'));
    const user = await getUser(t.accessToken);
    return await saveAndSignIn(request, {
      key: accountKey('tiktok', t.openId || user.open_id),
      platform: 'tiktok',
      username: user.username || user.display_name,
      display_name: user.display_name,
      followers_count: user.follower_count,
      media_count: user.video_count,
      profile_picture_url: user.avatar_url,
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresAt,
      scopes: t.scopes,
    });
  } catch (err) {
    console.error('TikTok connect failed:', err.message);
    return connectError(request, 'exchange', 'tiktok');
  }
}
