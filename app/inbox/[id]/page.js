import { notFound, redirect } from 'next/navigation';
import { db } from '../../../lib/db';
import { dollars } from '../../../lib/money';
import { OPEN_FOR_PAGE, engagement, refreshOffer, statusLabel } from '../../../lib/offers';
import { accessToken, platformLabel, platformOf } from '../../../lib/platforms';
import { currentPage } from '../../../lib/session';
import { creatorInfo } from '../../../lib/tiktok';
import { maxLength } from '../../../lib/x';
import { signedDownload } from '../../../lib/storage';
import { writeDraft } from '../../../lib/campaignDraft';
import OfferActions from './OfferActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign offer · pipp' };

function formatDay(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}

export default async function Offer({ params }) {
  const page = await currentPage();
  if (!page) redirect('/connect');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sql = await db();
  let [offer] = await sql`select * from offers where id = ${id} and ig_user_id in ${sql(page.keys)}`;
  if (!offer) notFound();
  const account = page.accounts.find((a) => a.ig_user_id === offer.ig_user_id);
  const platform = platformOf(account);
  const label = platformLabel(account);
  const [campaign] = await sql`select * from campaigns where id = ${offer.campaign_id}`;
  const [client] = await sql`select name from clients where id = ${campaign.client_id}`;
  const assetRows = await sql`select * from campaign_assets where campaign_id = ${campaign.id} order by sort_order, created_at`;

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
    assetRows.map(async (a, i) => ({
      id: a.id,
      n: i + 1,
      filename: a.filename,
      isImage: /^image\/(jpeg|png|webp)$/.test(a.content_type),
      isVideo: a.content_type.startsWith('video/'),
      viewUrl: await signedDownload(a.path).catch(() => null),
      downloadUrl: await signedDownload(a.path, `${i + 1}-${a.filename}`).catch(() => null),
    })),
  );
  // TikTok asks apps to check the creator's current posting options right before showing the post screen.
  let tiktok = null;
  if (platform === 'tiktok' && ['sent', 'approved', 'failed'].includes(offer.status)) {
    try {
      const info = await creatorInfo(await accessToken(account));
      tiktok = {
        nickname: info.creator_nickname || account.display_name || account.username,
        avatar: info.creator_avatar_url || null,
        privacyOptions: info.privacy_level_options || [],
        commentDisabled: Boolean(info.comment_disabled),
        duetDisabled: Boolean(info.duet_disabled),
        stitchDisabled: Boolean(info.stitch_disabled),
        maxSeconds: info.max_video_post_duration_sec || null,
      };
    } catch (err) {
      tiktok = { error: err.message.replace(/^[^:]+ failed: /, '') };
    }
  }

  const window = [formatDay(campaign.starts_on), formatDay(campaign.ends_on)].filter(Boolean).join(' to ');

  return (
    <main>
      <p className="small"><a href="/inbox">Campaign inbox</a></p>
      <article className="doc doc-wide">
        <p className="tag">{client?.name} · for @{account.username} on {label}</p>
        <h1>{campaign.name}</h1>
        <p className="date">
          {dollars(offer.fee_cents)} · {window ? `post ${window}` : 'no post window set'} ·{' '}
          <span className={`chip chip-${offer.status}`}>{statusLabel(offer.status, 'page')}</span>
        </p>

        <h2>Brief</h2>
        <p className="pre">{campaign.brief}</p>
        {campaign.extras && <p className="muted">Tags: {campaign.extras}</p>}
        {campaign.link && <p className="muted">Link: {campaign.link}</p>}

        <h2>Files</h2>
        {assets.length > 1 && (
          <p className="small">
            Numbered in the order {client?.name || 'the client'} wants them.{' '}
            {platform === 'instagram' ? 'Post them in this order as a carousel, or pick one.'
              : platform === 'x' ? 'Post up to 4 photos in this order, or pick one.'
              : 'TikTok takes one video per post, so pick the video.'}
          </p>
        )}
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
                <span><strong>{a.n}.</strong> {a.filename}</span>
                {a.downloadUrl && <a href={a.downloadUrl}>Download</a>}
              </figcaption>
            </figure>
          ))}
        </div>

        {offer.status === 'posted' && (
          <section className="card">
            <h2>Posted</h2>
            {offer.permalink && <p><a href={offer.permalink} target="_blank" rel="noreferrer">View the post on {label}</a></p>}
            <div className="stats">
              <div><span>{platform === 'instagram' ? 'Reach' : 'Views'}</span><strong>{offer.stats?.reach?.toLocaleString('en-US') ?? '—'}</strong></div>
              <div><span>Engagements</span><strong>{engagement(offer.stats)?.toLocaleString('en-US') ?? '—'}</strong></div>
              <div><span>You are owed</span><strong>{dollars(offer.fee_cents)}</strong></div>
            </div>
          </section>
        )}
        {offer.status === 'accepted' && offer.method === 'self' && (
          <section className="card">
            <h2>Waiting for your post</h2>
            <p>Post it on {label} with this caption. pipp spots it on your account automatically{platform === 'instagram' ? '' : ' within about 20 minutes'}; reopen this page to check.</p>
            <p className="pre caption-box">{offer.caption_final}</p>
          </section>
        )}
        {offer.status === 'declined' && <p className="notice">You declined this campaign.</p>}
        {offer.status === 'expired' && <p className="notice">This offer expired before you replied.</p>}
        {offer.status === 'review' && (
          <section className="card">
            <h2>With the client for approval</h2>
            <p>You changed the caption, so {client?.name} needs to approve it. pipp emails you when they reply.</p>
            <p className="pre caption-box">{offer.caption_final}</p>
          </section>
        )}
        {offer.status === 'publishing' && (
          <section className="card">
            <h2>Publishing</h2>
            <p>{label} is processing your post. Videos can take a few minutes; pipp finishes it automatically and emails you when it's live.</p>
          </section>
        )}
        {offer.status === 'failed' && offer.publish_error && (
          <p className="notice notice-error">Last attempt failed: {offer.publish_error} Nothing was posted. You can try again below.</p>
        )}
        {offer.status === 'approved' && offer.approval_note == null && (
          <p className="notice">{client?.name} approved your caption. Post it now, schedule it, or post it yourself.</p>
        )}
        {offer.status === 'sent' && offer.approval_note && (
          <p className="notice notice-error">{client?.name} asked for changes: "{offer.approval_note}"</p>
        )}
        {offer.expires_at && ['sent', 'approved'].includes(offer.status) && (
          <p className="small">Reply by {new Date(offer.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })}, or the offer expires.</p>
        )}

        {(OPEN_FOR_PAGE.includes(offer.status) || offer.status === 'scheduled') && (
          <OfferActions
            offerId={offer.id}
            status={offer.status}
            draft={offer.caption_draft || ''}
            initialCaption={offer.caption_final || offer.caption_draft || ''}
            approved={offer.caption_approved}
            approvedCaption={offer.caption_approved ? offer.caption_final : null}
            approveEdits={campaign.approve_edits}
            scheduledFor={offer.scheduled_for ? new Date(offer.scheduled_for).toISOString() : null}
            files={assets.filter((a) => a.isImage || a.isVideo).map((a) => ({ id: a.id, n: a.n, filename: a.filename, url: a.viewUrl, isVideo: a.isVideo }))}
            username={account.username}
            platform={platform}
            platformLabel={label}
            maxChars={platform === 'x' ? maxLength(account) : 2200}
            tiktok={tiktok}
            clientName={client?.name || 'the client'}
          />
        )}
      </article>
    </main>
  );
}
