import { db } from './db';

// Summarises a page's recent posts for clients choosing pages: average likes and
// comments, and engagement as a share of followers.
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
  };
}

export async function saveSnapshot(igUserId, media, followers) {
  const sql = await db();
  await sql`
    update instagram_accounts set snapshot = ${sql.json(buildSnapshot(media, followers))}, snapshot_at = now()
    where ig_user_id = ${igUserId}
  `;
}
