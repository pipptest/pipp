import { db } from './db';
import { decrypt } from './crypto';
import { getMediaInsights, getRecentMedia } from './instagram';

export const STATUS_LABELS = {
  sent: 'Awaiting reply',
  accepted: 'Accepted, waiting for post',
  posted: 'Posted',
  declined: 'Declined',
};

function normalise(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9@#]+/g, ' ').trim();
}

function handles(text) {
  return (String(text || '').toLowerCase().match(/@[a-z0-9._]+/g) || []).map((h) => h.replace(/\.$/, ''));
}

// Finds the page's post for a campaign among its recent media: posted after the
// offer was accepted, and either repeating the caption or tagging the campaign's handles.
export function matchPost(media, { caption, extras, since }) {
  const sinceMs = since ? new Date(since).getTime() - 5 * 60 * 1000 : 0;
  const wantedHandles = handles(extras);
  const captionStart = normalise(caption).slice(0, 40);
  return media.find((m) => {
    if (!m.caption || new Date(m.timestamp).getTime() < sinceMs) return false;
    const text = normalise(m.caption);
    if (captionStart.length >= 15 && text.includes(captionStart)) return true;
    const found = handles(m.caption);
    return wantedHandles.length > 0 && wantedHandles.every((h) => found.includes(h));
  }) || null;
}

// Brings one offer up to date: spots a self-posted campaign post, and refreshes
// the results of a live post at most every 15 minutes. Never throws.
export async function refreshOffer(offer, campaign, account) {
  if (!account) return offer;
  const sql = await db();
  try {
    const token = decrypt(account.access_token_enc);

    if (offer.status === 'accepted' && offer.method === 'self') {
      const media = await getRecentMedia(token, 25);
      const hit = matchPost(media, {
        caption: offer.caption_final || offer.caption_draft,
        extras: campaign.extras,
        since: offer.accepted_at,
      });
      if (!hit) return offer;
      [offer] = await sql`
        update offers set status = 'posted', media_id = ${hit.id}, permalink = ${hit.permalink},
          posted_at = ${hit.timestamp}, updated_at = now()
        where id = ${offer.id} returning *
      `;
    }

    const stale = !offer.stats_at || Date.now() - new Date(offer.stats_at).getTime() > 15 * 60 * 1000;
    if (offer.status === 'posted' && offer.media_id && stale) {
      let stats;
      try {
        stats = await getMediaInsights(token, offer.media_id);
      } catch (err) {
        stats = { unavailable: true };
        console.error('Insights unavailable:', err.message);
      }
      [offer] = await sql`
        update offers set stats = ${sql.json(stats)}, stats_at = now(), updated_at = now()
        where id = ${offer.id} returning *
      `;
    }
  } catch (err) {
    console.error('Offer refresh failed:', err.message);
  }
  return offer;
}

export function engagement(stats) {
  if (!stats) return null;
  const parts = ['likes', 'comments', 'shares', 'saved'].map((k) => stats[k]).filter((v) => typeof v === 'number');
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}
