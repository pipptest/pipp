import { db } from './db';
import { decrypt, encrypt } from './crypto';
import * as ig from './instagram';
import * as tt from './tiktok';
import * as x from './x';

// One place that knows how each platform differs. Everything else in pipp
// works with "accounts" and calls these helpers.

export const PLATFORMS = {
  instagram: {
    label: 'Instagram', loginPath: '/api/instagram/login', configured: ig.isConfigured,
    profileUrl: (a) => `https://www.instagram.com/${a.username}/`,
  },
  x: {
    label: 'X', loginPath: '/api/x/login', configured: x.isConfigured,
    profileUrl: (a) => `https://x.com/${a.username}`,
  },
  tiktok: {
    label: 'TikTok', loginPath: '/api/tiktok/login', configured: tt.isConfigured,
    profileUrl: (a) => `https://www.tiktok.com/@${a.username}`,
  },
};

export const PLATFORM_ORDER = ['instagram', 'x', 'tiktok'];

export function platformOf(account) {
  return account?.platform || 'instagram';
}

export function platformLabel(account) {
  return PLATFORMS[platformOf(account)].label;
}

export function profileUrl(account) {
  return PLATFORMS[platformOf(account)].profileUrl(account);
}

// The key stored in accounts.ig_user_id and offers.ig_user_id.
export function accountKey(platform, id) {
  if (platform === 'x') return `x:${id}`;
  if (platform === 'tiktok') return `tt:${id}`;
  return String(id);
}

export function platformId(account) {
  return String(account.ig_user_id).replace(/^(x|tt):/, '');
}

// What a page can post from pipp on each platform.
// multi: most files in one post (0 = no multi-file posts); multiPhotosOnly: X mixes no video into photo sets.
export const POSTING = {
  instagram: { multi: 10, multiPhotosOnly: false, videoOnly: false, multiName: 'carousel' },
  x: { multi: 4, multiPhotosOnly: true, videoOnly: false, multiName: 'photo set' },
  tiktok: { multi: 0, multiPhotosOnly: false, videoOnly: true, multiName: null },
};

const SKEW = 2 * 60 * 1000;

// A working access token. X tokens last 2 hours and TikTok's 24, so they are
// refreshed on demand. The row is locked while refreshing because both platforms
// replace the refresh token, and two refreshes at once would break the second.
export async function accessToken(account) {
  const platform = platformOf(account);
  if (platform === 'instagram') return decrypt(account.access_token_enc);
  if (account.token_expires_at && new Date(account.token_expires_at).getTime() - Date.now() > SKEW) {
    return decrypt(account.access_token_enc);
  }
  const updated = await refreshLocked(account);
  return decrypt(updated.access_token_enc);
}

async function refreshLocked(account) {
  const sql = await db();
  return sql.begin(async (tx) => {
    const [row] = await tx`select * from instagram_accounts where id = ${account.id} for update`;
    if (!row) throw new Error('This account was disconnected');
    if (row.token_expires_at && new Date(row.token_expires_at).getTime() - Date.now() > SKEW) return row;
    if (!row.refresh_token_enc) throw new Error(`Your ${platformLabel(row)} connection has ended. Reconnect it`);
    const api = platformOf(row) === 'x' ? x : tt;
    const t = await api.refresh(decrypt(row.refresh_token_enc));
    const [updated] = await tx`
      update instagram_accounts set access_token_enc = ${encrypt(t.accessToken)},
        refresh_token_enc = ${t.refreshToken ? encrypt(t.refreshToken) : row.refresh_token_enc},
        token_expires_at = ${t.expiresAt}, updated_at = now()
      where id = ${row.id} returning *
    `;
    return updated;
  });
}

// Keeps X and TikTok sign-ins alive between visits (used by the daily job).
export async function keepAlive(account) {
  if (platformOf(account) === 'instagram') return false;
  if (account.token_expires_at && new Date(account.token_expires_at).getTime() - Date.now() > SKEW) return false;
  await refreshLocked(account);
  return true;
}

// Followers and post count, in a common shape.
export async function fetchProfile(account) {
  const token = await accessToken(account);
  switch (platformOf(account)) {
    case 'x': {
      const me = await x.getMe(token);
      return {
        username: me.username, display_name: me.name, followers_count: me.public_metrics?.followers_count ?? null,
        media_count: me.public_metrics?.tweet_count ?? null, profile_picture_url: me.profile_image_url ?? null,
        account_type: me.subscription_type ?? null,
      };
    }
    case 'tiktok': {
      const u = await tt.getUser(token);
      return {
        username: u.username || account.username, display_name: u.display_name, followers_count: u.follower_count ?? null,
        media_count: u.video_count ?? null, profile_picture_url: u.avatar_url ?? null, account_type: null,
      };
    }
    default: {
      const p = await ig.getProfile(token);
      return {
        username: p.username, display_name: null, followers_count: p.followers_count ?? null,
        media_count: p.media_count ?? null, profile_picture_url: p.profile_picture_url ?? null, account_type: p.account_type ?? null,
      };
    }
  }
}

// Recent posts, newest first: { id, caption, timestamp, permalink, like_count, comments_count, media_type, image }.
// since: only posts after this time (X and TikTok).
export async function recentPosts(account, { limit = 20, since = null } = {}) {
  const token = await accessToken(account);
  switch (platformOf(account)) {
    case 'x':
      return x.getPosts(token, { userId: platformId(account), username: account.username, limit, since });
    case 'tiktok': {
      const videos = await tt.listVideos(token, limit);
      return since ? videos.filter((v) => new Date(v.timestamp) >= new Date(since)) : videos;
    }
    default: {
      const media = await ig.getMediaFull(token, limit);
      return media.map((m) => ({ ...m, image: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url }));
    }
  }
}

// Reach (Instagram) or views (X, TikTok) and engagement for one post.
export async function postStats(account, mediaId) {
  const token = await accessToken(account);
  switch (platformOf(account)) {
    case 'x': return x.getPostStats(token, mediaId);
    case 'tiktok': return tt.videoStats(token, mediaId);
    default: return ig.getMediaInsights(token, mediaId);
  }
}

// How often to look for a self-posted campaign post, and to refresh results.
// X charges per read, so it is checked less often.
export function checkEvery(account) {
  return { instagram: 0, x: 20 * 60 * 1000, tiktok: 10 * 60 * 1000 }[platformOf(account)];
}

export function statsEvery(account, postedAt) {
  const platform = platformOf(account);
  if (platform !== 'x') return 15 * 60 * 1000;
  const age = Date.now() - new Date(postedAt || Date.now()).getTime();
  return age < 2 * 24 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
}

// The page's own accounts, in a stable order.
export function sortAccounts(accounts) {
  return [...accounts].sort((a, b) => PLATFORM_ORDER.indexOf(platformOf(a)) - PLATFORM_ORDER.indexOf(platformOf(b)));
}

export async function revokeAccess(account) {
  try {
    const platform = platformOf(account);
    if (platform === 'x') await x.revoke(decrypt(account.access_token_enc));
    if (platform === 'tiktok') await tt.revoke(decrypt(account.access_token_enc));
  } catch {
    // Best effort: the row is deleted either way.
  }
}
