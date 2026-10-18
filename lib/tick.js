import { db } from './db';
import { notify, notifyPosted } from './notify';
import { refreshOffer } from './offers';
import { continuePublish, startCampaignPublish } from './publishing';

// The 5-minute job: expires unanswered offers, publishes scheduled posts, finishes
// videos still processing, and checks for posts pages made themselves.
export async function runTick() {
  const sql = await db();
  const out = { expired: 0, started: 0, finished: 0, failed: 0, detected: 0 };

  const expired = await sql`
    update offers set status = 'expired', updated_at = now()
    where status in ('sent', 'approved') and expires_at is not null and expires_at < now()
    returning id
  `;
  for (const o of expired) await notify('offer_expired', o.id);
  out.expired = expired.length;

  // Claim due posts first so two runs can never publish the same one.
  const due = await sql`
    update offers set status = 'publishing', updated_at = now()
    where id in (
      select id from offers where status = 'scheduled' and scheduled_for <= now()
      order by scheduled_for limit 10 for update skip locked
    )
    returning *
  `;
  for (const offer of due) {
    const [account] = await sql`select * from instagram_accounts where ig_user_id = ${offer.ig_user_id}`;
    const [asset] = await sql`select * from campaign_assets where id = ${offer.asset_id}`;
    if (!account || !asset) {
      await sql`update offers set status = 'failed', publish_error = 'The page or file is no longer available.', updated_at = now() where id = ${offer.id}`;
      await notify('page_failed', offer.id);
      out.failed += 1;
      continue;
    }
    const result = await startCampaignPublish(offer, account, asset);
    out.started += 1;
    if (result.status === 'posted') await notifyPosted(offer.id);
    if (result.status === 'failed') { out.failed += 1; await notify('page_failed', offer.id); }
  }

  const processing = await sql`
    select * from offers where status = 'publishing' and updated_at < now() - interval '20 seconds' limit 20
  `;
  for (const offer of processing) {
    if (!offer.container_id) {
      if (Date.now() - new Date(offer.updated_at).getTime() > 15 * 60 * 1000) {
        await sql`update offers set status = 'failed', publish_error = 'Publishing was interrupted. Nothing was posted.', updated_at = now() where id = ${offer.id}`;
        await notify('page_failed', offer.id);
        out.failed += 1;
      }
      continue;
    }
    const [account] = await sql`select * from instagram_accounts where ig_user_id = ${offer.ig_user_id}`;
    if (!account) continue;
    const result = await continuePublish(offer, account);
    if (result.status === 'posted') { out.finished += 1; await notifyPosted(offer.id); }
    if (result.status === 'failed') { out.failed += 1; await notify('page_failed', offer.id); }
  }

  const waiting = await sql`
    select o.*, c.extras from offers o join campaigns c on c.id = o.campaign_id
    where o.status = 'accepted' and o.method = 'self' limit 30
  `;
  for (const offer of waiting) {
    const [account] = await sql`select * from instagram_accounts where ig_user_id = ${offer.ig_user_id}`;
    const result = await refreshOffer(offer, { extras: offer.extras }, account);
    if (result.status === 'posted') out.detected += 1;
  }

  return out;
}
