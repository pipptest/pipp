// Instagram API with Instagram Login.
// Docs: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login

export const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'];

export function hasInsightsScope(account) {
  return String(account?.scopes || '').includes('instagram_business_manage_insights');
}

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

  const granted = Array.isArray(short.permissions) ? short.permissions.join(',') : String(short.permissions || '');
  return {
    accessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
    scopes: granted,
  };
}

export async function getProfile(accessToken) {
  const url = new URL('https://graph.instagram.com/me');
  url.searchParams.set('fields', 'user_id,username,account_type,followers_count,media_count,profile_picture_url');
  url.searchParams.set('access_token', accessToken);
  return readJson(await fetch(url, { cache: 'no-store' }), 'Profile');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Publishing happens in two steps: create a container Instagram downloads and
// processes, then publish it once its status is FINISHED. Images finish in seconds;
// videos can take minutes, so pipp's scheduler finishes those in the background.
// Docs: https://developers.facebook.com/documentation/instagram-platform/content-publishing
// carouselItem: one slide of a carousel (no caption). children: builds the carousel itself.
export async function createContainer(accessToken, igUserId, { imageUrl, videoUrl, caption, carouselItem = false, children = null }) {
  const attempt = async (extra) => {
    const url = new URL(`https://graph.instagram.com/${igUserId}/media`);
    if (children) {
      url.searchParams.set('media_type', 'CAROUSEL');
      url.searchParams.set('children', children.join(','));
    }
    if (imageUrl) url.searchParams.set('image_url', imageUrl);
    if (videoUrl) {
      url.searchParams.set('media_type', carouselItem ? 'VIDEO' : 'REELS');
      url.searchParams.set('video_url', videoUrl);
      for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    }
    if (carouselItem) url.searchParams.set('is_carousel_item', 'true');
    if (caption && !carouselItem) url.searchParams.set('caption', caption);
    url.searchParams.set('access_token', accessToken);
    return readJson(await fetch(url, { method: 'POST' }), 'Preparing the post');
  };
  if (!videoUrl || carouselItem) return (await attempt({})).id;
  try {
    return (await attempt({ share_to_feed: 'true' })).id;
  } catch (err) {
    if (!/share_to_feed|param/i.test(err.message)) throw err;
    return (await attempt({})).id;
  }
}

// IN_PROGRESS, FINISHED, PUBLISHED, ERROR or EXPIRED.
export async function containerStatus(accessToken, containerId) {
  const url = new URL(`https://graph.instagram.com/${containerId}`);
  url.searchParams.set('fields', 'status_code,status');
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url, { cache: 'no-store' }), 'Checking the post');
  return { code: body.status_code, detail: body.status || null };
}

export async function publishContainer(accessToken, igUserId, containerId) {
  const url = new URL(`https://graph.instagram.com/${igUserId}/media_publish`);
  url.searchParams.set('creation_id', containerId);
  url.searchParams.set('access_token', accessToken);
  const published = await readJson(await fetch(url, { method: 'POST' }), 'Publishing');
  const linkUrl = new URL(`https://graph.instagram.com/${published.id}`);
  linkUrl.searchParams.set('fields', 'permalink');
  linkUrl.searchParams.set('access_token', accessToken);
  const link = await readJson(await fetch(linkUrl, { cache: 'no-store' }), 'Fetching the post link').catch(() => ({}));
  return { id: published.id, permalink: link.permalink || null };
}

// Waits briefly for a container, then publishes it. Returns null if still processing.
export async function publishWhenReady(accessToken, igUserId, containerId, { tries = 8, waitMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { code } = await containerStatus(accessToken, containerId);
    if (code === 'FINISHED') return publishContainer(accessToken, igUserId, containerId);
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error('Preparing the post failed: Instagram could not process the file');
    }
    if (i < tries - 1) await sleep(waitMs);
  }
  return null;
}

// Publishes one feed image right away.
export async function publishImage(accessToken, igUserId, imageUrl, caption) {
  const containerId = await createContainer(accessToken, igUserId, { imageUrl, caption });
  const post = await publishWhenReady(accessToken, igUserId, containerId);
  if (!post) throw new Error('Preparing the post failed: Instagram took too long to process the image');
  return post;
}

export async function getMediaFull(accessToken, limit = 9) {
  const url = new URL('https://graph.instagram.com/me/media');
  url.searchParams.set('fields', 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url, { cache: 'no-store' }), 'Recent posts');
  return body.data || [];
}

// Reach and engagement for one post. Needs instagram_business_manage_insights.
export async function getMediaInsights(accessToken, mediaId) {
  const url = new URL(`https://graph.instagram.com/${mediaId}/insights`);
  url.searchParams.set('metric', 'reach,likes,comments,shares,saved');
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url, { cache: 'no-store' }), 'Post results');
  const stats = {};
  for (const m of body.data || []) {
    const v = m.values?.[0]?.value ?? m.total_value?.value;
    if (typeof v === 'number') stats[m.name] = v;
  }
  return stats;
}

export async function getRecentMedia(accessToken, limit = 12) {
  const url = new URL('https://graph.instagram.com/me/media');
  url.searchParams.set('fields', 'id,caption,media_type,permalink,timestamp,like_count,comments_count');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url, { cache: 'no-store' }), 'Recent posts');
  return body.data || [];
}
