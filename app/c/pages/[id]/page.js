import { notFound, redirect } from 'next/navigation';
import { currentClient } from '../../../../lib/clientAuth';
import { decrypt } from '../../../../lib/crypto';
import { db } from '../../../../lib/db';
import { getMediaFull } from '../../../../lib/instagram';
import { dollars } from '../../../../lib/money';
import { engagement } from '../../../../lib/offers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Page profile · pipp' };

const num = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString('en-US') : '—');

export default async function PageProfile({ params }) {
  if (!(await currentClient())) redirect('/c/login');
  const { id } = await params;
  if (!/^\d{3,30}$/.test(id)) notFound();

  const sql = await db();
  const [page] = await sql`select * from instagram_accounts where ig_user_id = ${id} and fee_cents is not null`;
  if (!page) notFound();

  const history = await sql`
    select status, stats from offers where ig_user_id = ${id} and status in ('posted', 'declined', 'expired', 'accepted', 'scheduled', 'approved')
  `;
  const posted = history.filter((h) => h.status === 'posted');
  const answered = history.filter((h) => h.status !== 'expired').length;
  const withReach = posted.filter((p) => typeof p.stats?.reach === 'number');
  const avgReach = withReach.length ? withReach.reduce((t, p) => t + p.stats.reach, 0) / withReach.length : null;
  const avgEng = withReach.length ? withReach.reduce((t, p) => t + (engagement(p.stats) || 0), 0) / withReach.length : null;

  let media = [];
  try {
    media = (await getMediaFull(decrypt(page.access_token_enc), 9)).filter((m) => m.media_url || m.thumbnail_url);
  } catch (err) {
    console.error('Profile media failed:', err.message);
  }
  const snap = page.snapshot || {};

  return (
    <main>
      <article className="doc doc-wide">
        <p className="tag">Page on pipp</p>
        <h1>@{page.username}</h1>
        <p className="date">
          <a href={`https://www.instagram.com/${page.username}/`} target="_blank" rel="noreferrer">View on Instagram</a>
        </p>

        <div className="stats">
          <div><span>Fee per post</span><strong>{dollars(page.fee_cents)}</strong></div>
          <div><span>Followers</span><strong>{num(page.followers_count)}</strong></div>
          <div><span>Engagement</span><strong>{snap.engagement_rate != null ? `${snap.engagement_rate}%` : '—'}</strong></div>
          <div><span>Avg likes per post</span><strong>{num(snap.avg_likes)}</strong></div>
          <div><span>Avg comments per post</span><strong>{num(snap.avg_comments)}</strong></div>
        </div>
        <p className="small">Engagement is average likes and comments on recent posts, as a share of followers.</p>

        <h2>On pipp</h2>
        <div className="stats">
          <div><span>Campaigns posted</span><strong>{posted.length}</strong></div>
          <div><span>Offers answered</span><strong>{history.length ? `${answered} of ${history.length}` : '—'}</strong></div>
          <div><span>Avg reach on campaigns</span><strong>{num(avgReach)}</strong></div>
          <div><span>Avg engagements on campaigns</span><strong>{num(avgEng)}</strong></div>
        </div>

        <h2>Recent posts</h2>
        {media.length === 0 ? (
          <p className="muted">Recent posts aren’t available right now.</p>
        ) : (
          <div className="assets">
            {media.map((m) => (
              <figure key={m.id}>
                <a href={m.permalink} target="_blank" rel="noreferrer">
                  <img src={m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url} alt={m.caption ? m.caption.slice(0, 120) : 'Instagram post'} />
                </a>
                <figcaption>
                  <span>{m.caption ? m.caption.slice(0, 60) : 'No caption'}</span>
                  <span>{typeof m.like_count === 'number' ? `${m.like_count.toLocaleString('en-US')} likes` : ''}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </article>
    </main>
  );
}
