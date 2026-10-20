import { notFound, redirect } from 'next/navigation';
import { currentClient } from '../../../../lib/clientAuth';
import { db } from '../../../../lib/db';
import { dollars } from '../../../../lib/money';
import { engagement } from '../../../../lib/offers';
import { platformLabel, platformOf, profileUrl } from '../../../../lib/platforms';
import { refreshStats } from '../../../../lib/snapshot';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Page profile · pipp' };

const num = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString('en-US') : '—');

export default async function PageProfile({ params }) {
  if (!(await currentClient())) redirect('/c/login');
  const { id } = await params;
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  if (!isUuid && !/^\d{3,30}$/.test(id)) notFound();

  const sql = await db();
  let [page] = isUuid
    ? await sql`select * from instagram_accounts where id = ${id} and fee_cents is not null`
    : await sql`select * from instagram_accounts where ig_user_id = ${id} and fee_cents is not null`;
  if (!page) notFound();
  const platform = platformOf(page);

  const history = await sql`
    select status, stats from offers where ig_user_id = ${page.ig_user_id} and status in ('posted', 'declined', 'expired', 'accepted', 'scheduled', 'approved')
  `;
  const posted = history.filter((h) => h.status === 'posted');
  const answered = history.filter((h) => h.status !== 'expired').length;
  const withReach = posted.filter((p) => typeof p.stats?.reach === 'number');
  const avgReach = withReach.length ? withReach.reduce((t, p) => t + p.stats.reach, 0) / withReach.length : null;
  const avgEng = withReach.length ? withReach.reduce((t, p) => t + (engagement(p.stats) || 0), 0) / withReach.length : null;

  try {
    page = await refreshStats(page);
  } catch (err) {
    console.error('Profile refresh failed:', err.message);
  }
  const snap = page.snapshot || {};
  const media = snap.recent || [];
  const others = await sql`
    select id, platform, username, fee_cents from instagram_accounts
    where owner_id = ${page.owner_id} and id <> ${page.id} and fee_cents is not null
  `;

  return (
    <main>
      <article className="doc doc-wide">
        <p className="tag">{platformLabel(page)} account on pipp</p>
        <h1>@{page.username}</h1>
        <p className="date">
          <a href={profileUrl(page)} target="_blank" rel="noreferrer">View on {platformLabel(page)}</a>
          {others.length > 0 && (
            <> · Also on pipp: {others.map((o, i) => (
              <span key={o.id}>{i ? ', ' : ''}<a href={`/c/pages/${o.id}`}>@{o.username} on {platformLabel(o)}</a></span>
            ))}</>
          )}
        </p>

        <div className="stats">
          <div><span>Fee per post</span><strong>{dollars(page.fee_cents)}</strong></div>
          <div><span>Followers</span><strong>{num(page.followers_count)}</strong></div>
          <div><span>Engagement</span><strong>{snap.engagement_rate != null ? `${snap.engagement_rate}%` : '—'}</strong></div>
          <div><span>Avg likes per post</span><strong>{num(snap.avg_likes)}</strong></div>
          <div><span>Avg {platform === 'x' ? 'replies' : 'comments'} per post</span><strong>{num(snap.avg_comments)}</strong></div>
        </div>
        <p className="small">Engagement is average likes and {platform === 'x' ? 'replies' : 'comments'} on recent posts, as a share of followers.</p>

        <h2>On pipp</h2>
        <div className="stats">
          <div><span>Campaigns posted</span><strong>{posted.length}</strong></div>
          <div><span>Offers answered</span><strong>{history.length ? `${answered} of ${history.length}` : '—'}</strong></div>
          <div><span>Avg {platform === 'instagram' ? 'reach' : 'views'} on campaigns</span><strong>{num(avgReach)}</strong></div>
          <div><span>Avg engagements on campaigns</span><strong>{num(avgEng)}</strong></div>
        </div>

        <h2>Recent posts</h2>
        {media.length === 0 ? (
          <p className="muted">Recent posts aren’t available right now.</p>
        ) : (
          <div className="assets">
            {media.map((m) => (
              <figure key={m.id}>
                <a href={m.permalink || profileUrl(page)} target="_blank" rel="noreferrer">
                  {m.image
                    ? <img src={m.image} alt={m.caption ? m.caption.slice(0, 120) : `${platformLabel(page)} post`} />
                    : <div className="asset-box text-post">{m.caption ? m.caption.slice(0, 180) : 'Post'}</div>}
                </a>
                <figcaption>
                  <span>{m.image && m.caption ? m.caption.slice(0, 60) : ''}</span>
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
