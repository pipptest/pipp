import { notFound, redirect } from 'next/navigation';
import { db } from '../../../lib/db';
import { dollars } from '../../../lib/money';
import { STATUS_LABELS, engagement, refreshOffer } from '../../../lib/offers';
import { currentAccount } from '../../../lib/session';
import { signedDownload } from '../../../lib/storage';
import { writeDraft } from '../../../lib/campaignDraft';
import OfferActions from './OfferActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign offer · pipp' };

function formatDay(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}

export default async function Offer({ params }) {
  const account = await currentAccount();
  if (!account) redirect('/connect');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sql = await db();
  let [offer] = await sql`select * from offers where id = ${id} and ig_user_id = ${account.ig_user_id}`;
  if (!offer) notFound();
  const [campaign] = await sql`select * from campaigns where id = ${offer.campaign_id}`;
  const [client] = await sql`select name from clients where id = ${campaign.client_id}`;
  const assetRows = await sql`select * from campaign_assets where campaign_id = ${campaign.id} order by created_at`;

  offer = await refreshOffer(offer, campaign, account);

  if (offer.status === 'sent' && !offer.caption_draft) {
    try {
      const draft = await writeDraft(account, campaign);
      [offer] = await sql`update offers set caption_draft = ${draft}, updated_at = now() where id = ${id} returning *`;
    } catch (err) {
      console.error('Drafting failed:', err.message);
    }
  }

  const assets = await Promise.all(
    assetRows.map(async (a) => ({
      id: a.id,
      filename: a.filename,
      isImage: /^image\/(jpeg|png|webp)$/.test(a.content_type),
      isVideo: a.content_type.startsWith('video/'),
      viewUrl: await signedDownload(a.path).catch(() => null),
      downloadUrl: await signedDownload(a.path, a.filename).catch(() => null),
    })),
  );
  const window = [formatDay(campaign.starts_on), formatDay(campaign.ends_on)].filter(Boolean).join(' to ');

  return (
    <main>
      <p className="small"><a href="/inbox">Campaign inbox</a></p>
      <article className="doc doc-wide">
        <p className="tag">{client?.name}</p>
        <h1>{campaign.name}</h1>
        <p className="date">
          {dollars(offer.fee_cents)} · {window ? `post ${window}` : 'no post window set'} ·{' '}
          <span className={`chip chip-${offer.status}`}>{offer.status === 'sent' ? 'New' : STATUS_LABELS[offer.status]}</span>
        </p>

        <h2>Brief</h2>
        <p className="pre">{campaign.brief}</p>
        {campaign.extras && <p className="muted">Tags: {campaign.extras}</p>}
        {campaign.link && <p className="muted">Link: {campaign.link}</p>}

        <h2>Files</h2>
        <div className="assets">
          {assets.map((a) => (
            <figure key={a.id}>
              {a.isImage && a.viewUrl ? (
                <img src={a.viewUrl} alt={a.filename} />
              ) : a.isVideo && a.viewUrl ? (
                <video src={a.viewUrl} controls preload="metadata" />
              ) : (
                <div className="asset-box">{a.filename}</div>
              )}
              <figcaption>
                <span>{a.filename}</span>
                {a.downloadUrl && <a href={a.downloadUrl}>Download</a>}
              </figcaption>
            </figure>
          ))}
        </div>

        {offer.status === 'posted' && (
          <section className="card">
            <h2>Posted</h2>
            {offer.permalink && <p><a href={offer.permalink} target="_blank" rel="noreferrer">View the post on Instagram</a></p>}
            <div className="stats">
              <div><span>Reach</span><strong>{offer.stats?.reach?.toLocaleString('en-US') ?? '—'}</strong></div>
              <div><span>Engagements</span><strong>{engagement(offer.stats)?.toLocaleString('en-US') ?? '—'}</strong></div>
              <div><span>You are owed</span><strong>{dollars(offer.fee_cents)}</strong></div>
            </div>
          </section>
        )}
        {offer.status === 'accepted' && offer.method === 'self' && (
          <section className="card">
            <h2>Waiting for your post</h2>
            <p>Post it on Instagram with this caption. pipp spots it on your account automatically; reopen this page to check.</p>
            <p className="pre caption-box">{offer.caption_final}</p>
          </section>
        )}
        {offer.status === 'declined' && <p className="notice">You declined this campaign.</p>}

        {offer.status === 'sent' && (
          <OfferActions
            offerId={offer.id}
            initialCaption={offer.caption_draft || ''}
            photos={assets.filter((a) => a.isImage).map((a) => ({ id: a.id, filename: a.filename, url: a.viewUrl }))}
            username={account.username}
          />
        )}
      </article>
    </main>
  );
}
