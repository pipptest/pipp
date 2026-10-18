'use server';

import { revalidatePath } from 'next/cache';
import { writeDraft } from '../../lib/campaignDraft';
import { db } from '../../lib/db';
import { toCents } from '../../lib/money';
import { notify, notifyPosted } from '../../lib/notify';
import { OPEN_FOR_PAGE, captionEdited } from '../../lib/offers';
import { isPublishable, startCampaignPublish } from '../../lib/publishing';
import { currentAccount } from '../../lib/session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveSettings(_prev, formData) {
  const account = await currentAccount();
  if (!account) return { error: 'Your Instagram connection has ended. Connect again.' };
  const rawFee = String(formData.get('fee') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const values = { fee: rawFee, email };
  const cents = rawFee === '' ? null : toCents(rawFee);
  if (rawFee !== '' && (cents === null || cents < 100)) return { values, error: 'Enter a fee of at least $1.' };
  if (email && !EMAIL.test(email)) return { values, error: 'Enter a valid email address.' };
  const sql = await db();
  await sql`
    update instagram_accounts set fee_cents = ${cents}, email = ${email || null}, updated_at = now()
    where ig_user_id = ${account.ig_user_id}
  `;
  revalidatePath('/account');
  return {
    ok: true,
    values,
    message: cents === null ? 'Saved. You are not taking campaigns right now.' : 'Saved. Clients can send you campaigns.',
  };
}

async function loadOffer(offerId) {
  const account = await currentAccount();
  if (!account) return { error: 'Your Instagram connection has ended. Connect again.' };
  if (!/^[0-9a-f-]{36}$/i.test(String(offerId))) return { error: 'Offer not found.' };
  const sql = await db();
  const [offer] = await sql`select * from offers where id = ${offerId} and ig_user_id = ${account.ig_user_id}`;
  if (!offer) return { error: 'Offer not found.' };
  const [campaign] = await sql`select * from campaigns where id = ${offer.campaign_id}`;
  return { account, offer, campaign, sql };
}

// The caption needs the client's sign-off if the campaign asks for it and the page
// changed the wording from the draft (or from the version the client approved).
function needsApproval(ctx, caption) {
  if (!ctx.campaign.approve_edits) return false;
  if (ctx.offer.caption_approved && !captionEdited(ctx.offer.caption_final, caption)) return false;
  return captionEdited(ctx.offer.caption_draft, caption);
}

function cleanCaption(caption) {
  return String(caption || '').trim().slice(0, 2200);
}

export async function newDraft(offerId) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  if (ctx.offer.status !== 'sent') return { error: 'This offer can’t be redrafted now.' };
  try {
    const draft = await writeDraft(ctx.account, ctx.campaign);
    await ctx.sql`update offers set caption_draft = ${draft}, updated_at = now() where id = ${offerId}`;
    return { draft };
  } catch (err) {
    console.error('Drafting failed:', err.message);
    return { error: 'Drafting failed. Try again in a moment.' };
  }
}

export async function requestApproval(offerId, caption) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  const text = cleanCaption(caption);
  if (!text) return { error: 'Add a caption first.' };
  const [updated] = await ctx.sql`
    update offers set status = 'review', caption_final = ${text}, caption_approved = false,
      approval_note = null, updated_at = now()
    where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning id
  `;
  if (!updated) return { error: 'This offer is no longer open.' };
  await notify('approval_needed', offerId);
  revalidatePath('/inbox');
  return { ok: true };
}

export async function declineOffer(offerId) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  const [updated] = await ctx.sql`
    update offers set status = 'declined', updated_at = now()
    where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning id
  `;
  if (!updated) return { error: 'This offer is no longer open.' };
  await notify('offer_declined', offerId);
  revalidatePath('/inbox');
  return { ok: true };
}

// Accept and post it yourself: pipp watches the account for the post.
export async function acceptSelf(offerId, caption) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  const text = cleanCaption(caption);
  if (needsApproval(ctx, text)) return { error: 'You changed the caption, so send it to the client for approval first.' };
  const [updated] = await ctx.sql`
    update offers set status = 'accepted', method = 'self', caption_final = ${text || null},
      accepted_at = now(), publish_error = null, updated_at = now()
    where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning id
  `;
  if (!updated) return { error: 'This offer is no longer open.' };
  await notify('offer_accepted', offerId);
  revalidatePath('/inbox');
  return { ok: true };
}

// Accept and post from pipp, now or at a scheduled time.
export async function acceptAndPublish(offerId, assetId, caption, scheduledFor) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  const text = cleanCaption(caption);
  if (needsApproval(ctx, text)) return { error: 'You changed the caption, so send it to the client for approval first.' };

  const [asset] = await ctx.sql`
    select * from campaign_assets where id = ${String(assetId)} and campaign_id = ${ctx.campaign.id}
  `;
  if (!asset || !isPublishable(asset.content_type)) return { error: 'Choose one of the campaign files to post.' };

  if (scheduledFor) {
    const at = new Date(scheduledFor);
    const ms = at.getTime() - Date.now();
    if (Number.isNaN(ms) || ms < 2 * 60 * 1000) return { error: 'Choose a time at least a few minutes from now.' };
    if (ms > 60 * 24 * 60 * 60 * 1000) return { error: 'Schedule within the next 60 days.' };
    const [updated] = await ctx.sql`
      update offers set status = 'scheduled', method = 'app', caption_final = ${text || null}, asset_id = ${asset.id},
        scheduled_for = ${at}, accepted_at = now(), publish_error = null, updated_at = now()
      where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning id
    `;
    if (!updated) return { error: 'This offer is no longer open.' };
    await notify('offer_accepted', offerId);
    revalidatePath('/inbox');
    return { ok: true, scheduled: true };
  }

  const [claimed] = await ctx.sql`
    update offers set status = 'publishing', method = 'app', caption_final = ${text || null}, asset_id = ${asset.id},
      scheduled_for = null, accepted_at = now(), container_id = null, publish_error = null, updated_at = now()
    where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning *
  `;
  if (!claimed) return { error: 'This offer is no longer open.' };
  const result = await startCampaignPublish(claimed, ctx.account, asset);
  revalidatePath('/inbox');
  if (result.status === 'posted') {
    await notifyPosted(offerId);
    return { ok: true, permalink: result.permalink };
  }
  if (result.status === 'failed') return { error: result.publish_error };
  await notify('offer_accepted', offerId);
  return { ok: true, processing: true };
}

// Moves a scheduled post back so the page can change the time or caption.
export async function cancelSchedule(offerId) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  const [updated] = await ctx.sql`
    update offers set status = case when caption_approved then 'approved' else 'sent' end,
      scheduled_for = null, method = null, updated_at = now()
    where id = ${offerId} and status = 'scheduled' returning id
  `;
  if (!updated) return { error: 'This post is no longer scheduled.' };
  revalidatePath('/inbox');
  return { ok: true };
}
