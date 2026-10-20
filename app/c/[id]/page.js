import { notFound, redirect } from 'next/navigation';
import { currentClient } from '../../../lib/clientAuth';
import { db } from '../../../lib/db';
import { dollars } from '../../../lib/money';
import { engagement, refreshOffer, statusLabel } from '../../../lib/offers';
import ReviewCaption from './ReviewCaption';
import ClientNav from '../ClientNav';

const PLATFORM_LABELS = { instagram: 'Instagram', x: 'X', tiktok: 'TikTok' };

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign · pipp' };

const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');

function formatDay(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function Campaign({ params, searchParams }) {
  const client = await currentClient();
  if (!client) redirect('/c/login');
  const { id } = await params;
  const sent = (await searchParams)?.sent;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sql = await db();
  const [campaign] = await sql`select * from campaigns where id = ${id} and client_id = ${client.id}`;
  if (!campaign) notFound();

  const rows = await sql`
    select o.*, a.username, a.platform, a.id as account_row
    from offers o left join instagram_accounts a on a.ig_user_id = o.ig_user_id
    where o.campaign_id = ${id} order by o.created_at
  `;
  const accountRows = rows.some((r) => r.account_row)
    ? await sql`select * from instagram_accounts where id in ${sql(rows.filter((r) => r.account_row).map((r) => r.account_row))}`
    : [];
  const offers = await Promise.all(
    rows.map(async (r) => {
      const account = accountRows.find((a) => a.id === r.account_row) || null;
      const fresh = await refreshOffer(r, campaign, account);
      return { ...fresh, username: r.username, platform: r.platform || 'instagram' };
    }),
  );

  const live = offers.filter((o) => o.status === 'posted');
  const reach = live.reduce((t, o) => t + (o.stats?.reach || 0), 0);
  const eng = live.reduce((t, o) => t + (engagement(o.stats) || 0), 0);
  const committed = offers.filter((o) => ['accepted', 'approved', 'scheduled', 'publishing', 'posted'].includes(o.status)).reduce((t, o) => t + o.fee_cents, 0);
  const owed = live.reduce((t, o) => t + o.fee_cents, 0);
  const window = [formatDay(campaign.starts_on), formatDay(campaign.ends_on)].filter(Boolean).join(' to ');

  return (
    <main>
      <ClientNav name={client.name} current="campaigns" />
      <p className="small"><a href="/c">All campaigns</a></p>
      {sent && <p className="notice">Sent. Each page now has your files, your brief and a caption drafted in its voice.</p>}
      <div className="page-head">
        <div>
          <h1 className="title">{campaign.name}</h1>
          <p className="muted">{window ? `Post window: ${window}` : 'No post window set'}</p>
        </div>
        <a className="button button-small" href={`/c/${id}`}>Refresh</a>
      </div>
      {offers.some((o) => o.status === 'review') && (
        <p className="notice">A page edited its caption and needs your approval. See below.</p>
      )}

      <div className="stats">
        <div><span>Pages</span><strong>{offers.length}</strong></div>
        <div><span>Posted</span><strong>{live.length}</strong></div>
        <div><span>Reach and views</span><strong>{live.length ? num(reach) : '—'}</strong></div>
        <div><span>Engagements</span><strong>{live.length ? num(eng) : '—'}</strong></div>
        <div><span>Committed</span><strong>{dollars(committed)}</strong></div>
        <div><span>Owed for live posts</span><strong>{dollars(owed)}</strong></div>
      </div>

      <section className="card">
        <h2>Brief</h2>
        <p className="pre">{campaign.brief}</p>
        {campaign.extras && <p className="muted">Tags: {campaign.extras}</p>}
        {campaign.link && <p className="muted">Link: <a href={campaign.link} target="_blank" rel="noreferrer">{campaign.link}</a></p>}
      </section>

      <section className="card card-flush">
        <h2 className="card-pad">Pages</h2>
        {offers.map((o) => (
          <div key={o.id} className="offer-row">
            <div className="grow">
              {o.username && <span className={`platform platform-${o.platform}`}>{PLATFORM_LABELS[o.platform]}</span>}
              <strong>@{o.username || 'disconnected page'}</strong>
              <span className={`chip chip-${o.status}`}>{statusLabel(o.status, 'client')}</span>
              {o.status === 'scheduled' && o.scheduled_for && (
                <span className="muted">for {new Date(o.scheduled_for).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })}</span>
              )}
              {o.status === 'sent' && o.expires_at && (
                <span className="muted">reply due {new Date(o.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })}</span>
              )}
              {o.status === 'posted' && o.permalink && (
                <a href={o.permalink} target="_blank" rel="noreferrer">View post</a>
              )}
            </div>
            <div className="cell"><span className="muted">{o.platform === 'instagram' ? 'Reach' : 'Views'}</span><strong>{num(o.stats?.reach)}</strong></div>
            <div className="cell"><span className="muted">Engagements</span><strong>{num(engagement(o.stats))}</strong></div>
            <div className="cell"><span className="muted">Fee</span><strong>{dollars(o.fee_cents)}</strong></div>
            {o.status === 'review' && (
              <ReviewCaption offerId={o.id} username={o.username || 'the page'} caption={o.caption_final || ''} />
            )}
          </div>
        ))}
        {offers.some((o) => o.stats?.unavailable) && (
          <p className="small card-pad">Some results aren’t available yet: Instagram pages need to reconnect once to share reach, and TikTok videos posted from pipp stay private until TikTok finishes reviewing pipp.</p>
        )}
      </section>
      <p className="small">Payments are handled outside pipp during the beta. You only owe pages whose post is live. Reach is people reached on Instagram; on X and TikTok it’s views.</p>
    </main>
  );
}
