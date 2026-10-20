import { createHash } from 'node:crypto';
import { siteOrigin } from './instagram';

// X API v2 with OAuth 2.0 (authorization code with PKCE).
// Docs: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
// X bills per request (pay-per-use credits bought in console.x.com), so pipp reads
// sparingly: only posts made after an offer was accepted, and stats at most hourly.

export const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];
const API = 'https://api.x.com';

export function isConfigured() {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

export function redirectUri(request) {
  return siteOrigin(request) + '/api/x/callback';
}

export function codeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function authorizeUrl(request, state, verifier) {
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.X_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri(request));
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');
}

function errorMessage(body, res) {
  if (res.status === 402) return 'pipp’s X API credits have run out';
  if (res.status === 429) return 'X is rate limiting pipp; try again in a few minutes';
  return body?.detail || body?.errors?.[0]?.message || body?.error_description || body?.title || body?.error || res.statusText;
}

async function readJson(res, step) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body.errors && !body.data)) throw new Error(`${step} failed: ${errorMessage(body, res)}`);
  return body;
}

async function tokenRequest(params) {
  const res = await fetch(`${API}/2/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: new URLSearchParams(params),
  });
  const body = await readJson(res, 'X sign-in');
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt: new Date(Date.now() + (body.expires_in || 7200) * 1000),
    scopes: String(body.scope || '').split(' ').filter(Boolean).join(','),
  };
}

export function exchangeCode(request, code, verifier) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(request), code_verifier: verifier });
}

// Access tokens last two hours. Each refresh returns a new refresh token.
export function refresh(refreshToken) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

export async function revoke(token) {
  await fetch(`${API}/2/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
  }).catch(() => {});
}

async function get(token, path, params, step) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, String(v));
  return readJson(await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }), step);
}

export async function getMe(token) {
  const { data } = await get(token, '/2/users/me', { 'user.fields': 'public_metrics,profile_image_url,name,username,subscription_type' }, 'X profile');
  return data;
}

function permalink(username, id) {
  return `https://x.com/${username}/status/${id}`;
}

// The account's own recent posts, newest first, in pipp's common shape.
// since: only posts after this time (keeps reads, and X's charges, small).
export async function getPosts(token, { userId, username, limit = 20, since = null }) {
  const body = await get(token, `/2/users/${userId}/tweets`, {
    max_results: Math.min(100, Math.max(5, limit)),
    exclude: 'retweets,replies',
    'tweet.fields': 'created_at,public_metrics,note_tweet',
    expansions: 'attachments.media_keys',
    'media.fields': 'url,preview_image_url,type',
    start_time: since ? new Date(since).toISOString() : undefined,
  }, 'Recent X posts');
  const media = Object.fromEntries((body.includes?.media || []).map((m) => [m.media_key, m]));
  return (body.data || []).map((t) => {
    const first = media[t.attachments?.media_keys?.[0]];
    return {
      id: t.id,
      caption: t.note_tweet?.text || t.text,
      timestamp: t.created_at,
      permalink: permalink(username, t.id),
      like_count: t.public_metrics?.like_count,
      comments_count: t.public_metrics?.reply_count,
      media_type: first ? first.type.toUpperCase() : 'TEXT',
      image: first ? first.url || first.preview_image_url || null : null,
    };
  });
}

// Views and engagement for one post.
export async function getPostStats(token, id) {
  const { data } = await get(token, `/2/tweets/${id}`, { 'tweet.fields': 'public_metrics' }, 'X post results');
  const m = data?.public_metrics || {};
  const views = typeof m.impression_count === 'number' ? m.impression_count : undefined;
  return {
    reach: views,
    views,
    likes: m.like_count,
    comments: m.reply_count,
    shares: (m.retweet_count || 0) + (m.quote_count || 0),
    saved: m.bookmark_count,
  };
}

// Uploads one file in up to 4 MB chunks. Returns { id, state } where state is
// 'succeeded' or still 'pending'/'in_progress' for videos X is processing.
// Docs: https://docs.x.com/x-api/media/quickstart/media-upload-chunked
export async function uploadMedia(token, buffer, mediaType, category) {
  const auth = { Authorization: `Bearer ${token}` };
  const init = await readJson(await fetch(`${API}/2/media/upload/initialize`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: mediaType, total_bytes: buffer.length, media_category: category }),
  }), 'Preparing the post');
  const id = init.data.id;
  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, part = 0; i < buffer.length; i += CHUNK, part++) {
    const form = new FormData();
    form.set('segment_index', String(part));
    form.set('media', new Blob([buffer.subarray(i, i + CHUNK)], { type: mediaType }));
    const res = await fetch(`${API}/2/media/upload/${id}/append`, { method: 'POST', headers: auth, body: form });
    if (!res.ok) await readJson(res, 'Preparing the post');
  }
  const fin = await readJson(await fetch(`${API}/2/media/upload/${id}/finalize`, { method: 'POST', headers: auth }), 'Preparing the post');
  return { id, state: fin.data?.processing_info?.state || 'succeeded' };
}

export async function mediaState(token, id) {
  const body = await get(token, '/2/media/upload', { command: 'STATUS', media_id: id }, 'Checking the post');
  return body.data?.processing_info?.state || 'succeeded';
}

export async function createPost(token, username, text, mediaIds) {
  const body = await readJson(await fetch(`${API}/2/tweets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
  }), 'Publishing');
  return { id: body.data.id, permalink: permalink(username, body.data.id) };
}

// X counts most characters as 1, but emoji and CJK as 2, and every link as 23.
// Mirrors twitter-text's default weighting closely enough to warn before posting.
export function postLength(text) {
  const withLinks = String(text || '').replace(/https?:\/\/\S+/gi, 'x'.repeat(23));
  let n = 0;
  for (const ch of withLinks) {
    const c = ch.codePointAt(0);
    const light = c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247);
    n += light ? 1 : 2;
  }
  return n;
}

// Premium subscribers can post up to 25,000 characters.
export function maxLength(account) {
  return account?.account_type && account.account_type !== 'None' ? 25000 : 280;
}
