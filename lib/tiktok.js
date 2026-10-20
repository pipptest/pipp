import { siteOrigin } from './instagram';

// TikTok Login Kit and Content Posting API (Direct Post).
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
// Until TikTok audits pipp, everything pipp posts is visible only to the creator.

export const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.publish'];
const API = 'https://open.tiktokapis.com';

export function isConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

export function redirectUri(request) {
  return siteOrigin(request) + '/api/tiktok/callback';
}

export function authorizeUrl(request, state) {
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('redirect_uri', redirectUri(request));
  url.searchParams.set('state', state);
  return url.toString();
}

const FRIENDLY = {
  spam_risk_too_many_posts: 'TikTok says this account has posted too many times today. Try again tomorrow',
  spam_risk_user_banned_from_posting: 'TikTok isn’t letting this account post right now',
  reached_active_user_cap: 'pipp has reached TikTok’s daily posting limit for unreviewed apps. Try again tomorrow',
  unaudited_client_can_only_post_to_private_accounts: 'Until TikTok reviews pipp, posting only works for private TikTok accounts with “Only me” visibility',
  privacy_level_option_mismatch: 'That privacy setting isn’t available on this TikTok account',
  rate_limit_exceeded: 'TikTok is rate limiting pipp; try again in a minute',
  access_token_invalid: 'Your TikTok connection has ended. Reconnect TikTok',
  scope_not_authorized: 'Reconnect TikTok and allow every permission pipp asks for',
};

async function readJson(res, step) {
  const body = await res.json().catch(() => ({}));
  const code = body.error?.code;
  if (!res.ok || (code && code !== 'ok') || (body.error && typeof body.error === 'string')) {
    const message = FRIENDLY[code] || body.error?.message || body.error_description || body.error || res.statusText;
    throw new Error(`${step} failed: ${message}`);
  }
  return body;
}

async function tokenRequest(params) {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, ...params }),
  });
  const body = await readJson(res, 'TikTok sign-in');
  return {
    openId: body.open_id,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt: new Date(Date.now() + (body.expires_in || 86400) * 1000),
    scopes: String(body.scope || ''),
  };
}

export function exchangeCode(request, code) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(request) });
}

// Access tokens last 24 hours, refresh tokens a year. The refresh token can change.
export function refresh(refreshToken) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

export async function revoke(token) {
  await fetch(`${API}/v2/oauth/revoke/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, token }),
  }).catch(() => {});
}

function auth(token, json = false) {
  return { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}) };
}

export async function getUser(token) {
  const url = `${API}/v2/user/info/?fields=open_id,avatar_url,display_name,username,follower_count,video_count`;
  const body = await readJson(await fetch(url, { headers: auth(token), cache: 'no-store' }), 'TikTok profile');
  return body.data.user;
}

const VIDEO_FIELDS = 'id,title,video_description,create_time,share_url,cover_image_url,view_count,like_count,comment_count,share_count';

function shape(v) {
  return {
    id: String(v.id),
    caption: v.video_description || v.title || '',
    timestamp: new Date(v.create_time * 1000).toISOString(),
    permalink: v.share_url || null,
    like_count: v.like_count,
    comments_count: v.comment_count,
    media_type: 'VIDEO',
    image: v.cover_image_url || null,
  };
}

// The creator's public videos, newest first, in pipp's common shape.
export async function listVideos(token, limit = 20) {
  const body = await readJson(await fetch(`${API}/v2/video/list/?fields=${VIDEO_FIELDS}`, {
    method: 'POST', headers: auth(token, true), body: JSON.stringify({ max_count: Math.min(20, limit) }), cache: 'no-store',
  }), 'Recent TikTok videos');
  return (body.data?.videos || []).map(shape);
}

export async function videoStats(token, id) {
  const body = await readJson(await fetch(`${API}/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count`, {
    method: 'POST', headers: auth(token, true), body: JSON.stringify({ filters: { video_ids: [String(id)] } }), cache: 'no-store',
  }), 'TikTok post results');
  const v = body.data?.videos?.[0];
  if (!v) return { unavailable: true };
  return { reach: v.view_count, views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count };
}

// Must be checked right before showing the post screen and before posting:
// which privacy levels the creator can use, interaction settings and video length limit.
export async function creatorInfo(token) {
  const body = await readJson(await fetch(`${API}/v2/post/publish/creator_info/query/`, {
    method: 'POST', headers: auth(token, true), cache: 'no-store',
  }), 'Checking your TikTok');
  return body.data;
}

// Starts a direct post and returns where to upload the video (valid for one hour).
export async function initVideo(token, postInfo, size) {
  const body = await readJson(await fetch(`${API}/v2/post/publish/video/init/`, {
    method: 'POST',
    headers: auth(token, true),
    body: JSON.stringify({
      post_info: postInfo,
      // pipp files are at most 50 MB, so one chunk is always allowed.
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
    }),
  }), 'Preparing the post');
  return body.data;
}

export async function uploadVideo(uploadUrl, buffer, contentType) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Preparing the post failed: TikTok didn’t accept the video upload (${res.status})`);
}

// PROCESSING_UPLOAD, PUBLISH_COMPLETE or FAILED (with fail_reason). TikTok post ids
// are larger than JavaScript numbers can hold exactly, so they are read from the raw text.
export async function publishStatus(token, publishId) {
  const res = await fetch(`${API}/v2/post/publish/status/fetch/`, {
    method: 'POST', headers: auth(token, true), body: JSON.stringify({ publish_id: publishId }), cache: 'no-store',
  });
  const text = await res.text();
  const body = await readJson(new Response(text, { status: res.status }), 'Checking the post');
  const ids = /"publicaly_available_post_id"\s*:\s*\[([^\]]*)\]/.exec(text)?.[1].match(/\d+/g) || [];
  return { ...body.data, post_ids: ids };
}
