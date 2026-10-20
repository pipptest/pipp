import { db } from './db';
import { fetchProfile, platformOf, recentPosts } from './platforms';

// Summarises a page's recent posts for clients choosing pages: average likes and
// comments, engagement as a share of followers, and a few recent captions.
export function buildSnapshot(media, followers) {
  const posts = media.filter((m) => typeof m.like_count === 'number');
  const avg = (key) => (posts.length ? posts.reduce((t, m) => t + (m[key] || 0), 0) / posts.length : null);
  const avgLikes = avg('like_count');
  const avgComments = avg('comments_count');
  const rate = followers && avgLikes != null ? ((avgLikes + (avgComments || 0)) / followers) * 100 : null;
  return {
    posts_sampled: posts.length,
    avg_likes: avgLikes == null ? null : Math.round(avgLikes),
    avg_comments: avgComments == null ? null : Math.round(avgComments),
    engagement_rate: rate == null ? null : Math.round(rate * 100) / 100,
    last_post_at: media[0]?.timestamp || null,
    recent: media.filter((m) => m.caption).slice(0, 8).map((m) => ({
      id: m.id, caption: m.caption, timestamp: m.timestamp, permalink: m.permalink,
      like_count: m.like_count ?? null, media_type: m.media_type || null, image: m.image || null,
    })),
  };
}

export async function saveSnapshot(key, media, followers) {
  const sql = await db();
  await sql`
    update instagram_accounts set snapshot = ${sql.json(buildSnapshot(media, followers))}, snapshot_at = now()
    where ig_user_id = ${key}
  `;
}

// How long saved stats are reused before asking the platform again. X charges
// per read, so its stats are refreshed at most every few hours.
const MAX_AGE = { instagram: 0, x: 6 * 60 * 60 * 1000, tiktok: 30 * 60 * 1000 };

// Refreshes followers, post count and the snapshot for one account. Returns the
// updated row, or the saved row if it is recent enough (or the platform fails).
export async function refreshStats(account, { force = false } = {}) {
  const age = account.snapshot_at ? Date.now() - new Date(account.snapshot_at).getTime() : Infinity;
  if (!force && age < MAX_AGE[platformOf(account)]) return account;
  const [profile, media] = await Promise.all([fetchProfile(account), recentPosts(account, { limit: 12 })]);
  const sql = await db();
  const [updated] = await sql`
    update instagram_accounts set
      username = ${profile.username || account.username}, display_name = ${profile.display_name ?? account.display_name ?? null},
      followers_count = ${profile.followers_count}, media_count = ${profile.media_count},
      profile_picture_url = ${profile.profile_picture_url}, account_type = ${profile.account_type ?? account.account_type ?? null},
      snapshot = ${sql.json(buildSnapshot(media, profile.followers_count))}, snapshot_at = now(), updated_at = now()
    where id = ${account.id} returning *
  `;
  return updated || account;
}
