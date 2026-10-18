// Instagram API with Instagram Login.
// Docs: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login

export const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

export function isConfigured() {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export function siteOrigin(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

export function redirectUri(request) {
  return siteOrigin(request) + '/api/instagram/callback';
}

export function authorizeUrl(request, state) {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', process.env.INSTAGRAM_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri(request));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

async function readJson(res, step) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error || body.error_type) {
    const message = body.error_message || body.error?.message || body.error_description || res.statusText;
    throw new Error(`${step} failed: ${message}`);
  }
  return body;
}

// Exchanges the one-time code for a short-lived token, then for a long-lived one (about 60 days).
export async function exchangeCode(request, code) {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(request),
    code,
  });
  const shortRes = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
  const shortBody = await readJson(shortRes, 'Token exchange');
  const short = Array.isArray(shortBody.data) ? shortBody.data[0] : shortBody;

  const longUrl = new URL('https://graph.instagram.com/access_token');
  longUrl.searchParams.set('grant_type', 'ig_exchange_token');
  longUrl.searchParams.set('client_secret', process.env.INSTAGRAM_APP_SECRET);
  longUrl.searchParams.set('access_token', short.access_token);
  const long = await readJson(await fetch(longUrl), 'Long-lived token');

  return {
    accessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}

export async function getProfile(accessToken) {
  const url = new URL('https://graph.instagram.com/me');
  url.searchParams.set('fields', 'user_id,username,account_type,followers_count,media_count,profile_picture_url');
  url.searchParams.set('access_token', accessToken);
  return readJson(await fetch(url, { cache: 'no-store' }), 'Profile');
}

export async function getRecentMedia(accessToken, limit = 12) {
  const url = new URL('https://graph.instagram.com/me/media');
  url.searchParams.set('fields', 'id,caption,media_type,permalink,timestamp,like_count,comments_count');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url, { cache: 'no-store' }), 'Recent posts');
  return body.data || [];
}
