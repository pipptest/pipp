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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Publishes one feed image. Instagram fetches imageUrl itself, so it must be public.
// Docs: https://developers.facebook.com/documentation/instagram-platform/content-publishing
export async function publishImage(accessToken, igUserId, imageUrl, caption) {
  const create = new URL(`https://graph.instagram.com/${igUserId}/media`);
  create.searchParams.set('image_url', imageUrl);
  if (caption) create.searchParams.set('caption', caption);
  create.searchParams.set('access_token', accessToken);
  const container = await readJson(await fetch(create, { method: 'POST' }), 'Preparing the post');

  for (let i = 0; i < 10; i++) {
    const statusUrl = new URL(`https://graph.instagram.com/${container.id}`);
    statusUrl.searchParams.set('fields', 'status_code');
    statusUrl.searchParams.set('access_token', accessToken);
    const status = await readJson(await fetch(statusUrl, { cache: 'no-store' }), 'Checking the post');
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error('Preparing the post failed: Instagram could not process the image');
    }
    await sleep(1500);
  }

  const publish = new URL(`https://graph.instagram.com/${igUserId}/media_publish`);
  publish.searchParams.set('creation_id', container.id);
  publish.searchParams.set('access_token', accessToken);
  const published = await readJson(await fetch(publish, { method: 'POST' }), 'Publishing');

  const linkUrl = new URL(`https://graph.instagram.com/${published.id}`);
  linkUrl.searchParams.set('fields', 'permalink');
  linkUrl.searchParams.set('access_token', accessToken);
  const link = await readJson(await fetch(linkUrl, { cache: 'no-store' }), 'Fetching the post link').catch(() => ({}));
  return { id: published.id, permalink: link.permalink || null };
}

export async function getRecentMedia(accessToken, limit = 12) {
  const url = new URL('https://graph.instagram.com/me/media');
  url.searchParams.set('fields', 'id,caption,media_type,permalink,timestamp,like_count,comments_count');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url, { cache: 'no-store' }), 'Recent posts');
  return body.data || [];
}
