import { exchangeCode, getProfile } from '../../../../lib/instagram';
import { checkState, connectError, saveAndSignIn } from '../../../../lib/link';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  if (params.get('error')) return connectError(request, 'denied', 'instagram');
  if (!params.get('code') || !checkState(request)) return connectError(request, 'state', 'instagram');

  try {
    const { accessToken, expiresAt, scopes } = await exchangeCode(request, params.get('code'));
    const profile = await getProfile(accessToken);
    return await saveAndSignIn(request, {
      key: String(profile.user_id),
      platform: 'instagram',
      username: profile.username,
      account_type: profile.account_type,
      followers_count: profile.followers_count,
      media_count: profile.media_count,
      profile_picture_url: profile.profile_picture_url,
      accessToken,
      expiresAt,
      scopes,
    });
  } catch (err) {
    console.error('Instagram connect failed:', err.message);
    return connectError(request, 'exchange', 'instagram');
  }
}
