'use server';

import { revalidatePath } from 'next/cache';
import { writeDraft } from '../../lib/campaignDraft';
import { db } from '../../lib/db';
import { toCents } from '../../lib/money';
import { notify, notifyPosted } from '../../lib/notify';
import { OPEN_FOR_PAGE, captionEdited } from '../../lib/offers';
import { POSTING, accessToken, platformOf } from '../../lib/platforms';
import { isPublishable, postingProblem, startCampaignPublish } from '../../lib/publishing';
import { currentPage } from '../../lib/session';
import { creatorInfo } from '../../lib/tiktok';
import { maxLength, postLength } from '../../lib/x';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Saves the page's alert email (shared by its accounts) and each account's fee.
export async function saveSettings(_prev, formData) {
  const page = await currentPage();
  if (!page) return { error: 'Your connection has ended. Connect again.' };
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const fees = Object.fromEntries(page.accounts.map((a) => [a.ig_user_id, String(formData.get(`fee:${a.ig_user_id}`) ?? '').trim()]));
  const values = { email, fees };
  if (email && !EMAIL.test(email)) return { values, error: 'Enter a valid email address.' };
  const cents = {};
  for (const a of page.accounts) {
    const raw = fees[a.ig_user_id];
    cents[a.ig_user_id] = raw === '' ? null : toCents(raw);
    if (raw !== '' && (cents[a.ig_user_id] === null || cents[a.ig_user_id] < 100)) {
      return { values, error: `Enter a fee of at least $1 for @${a.username}, or leave it empty.` };
    }
  }
  const sql = await db();
  for (const a of page.accounts) {
    await sql`
      update instagram_accounts set fee_cents = ${cents[a.ig_user_id]}, email = ${email || null}, updated_at = now()
      where id = ${a.id}
    `;
  }
  revalidatePath('/account');
  const taking = Object.values(cents).filter((c) => c !== null).length;
  return {
    ok: true,
    values,
    message: taking ? `Saved. Clients can send campaigns to ${taking === 1 ? 'that account' : `those ${taking} accounts`}.` : 'Saved. You are not taking campaigns right now.',
  };
}

// An offer for any of the page's linked accounts, with the account it was sent to.
async function loadOffer(offerId) {
  const page = await currentPage();
  if (!page) return { error: 'Your connection has ended. Connect again.' };
  if (!/^[0-9a-f-]{36}$/i.test(String(offerId))) return { error: 'Offer not found.' };
  const sql = await db();
  const [offer] = await sql`select * from offers where id = ${offerId} and ig_user_id in ${sql(page.keys)}`;
  if (!offer) return { error: 'Offer not found.' };
  const account = page.accounts.find((a) => a.ig_user_id === offer.ig_user_id);
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

// X posts have a length limit; other platforms allow 2,200 characters.
function captionProblem(account, text) {
  if (platformOf(account) !== 'x') return null;
  const n = postLength(text);
  const max = maxLength(account);
  return n > max ? `This caption is ${n} characters and X allows ${max}. Shorten it first.` : null;
}

const PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];

// TikTok requires the creator to choose these each time, from options TikTok allows right now.
async function tiktokOptions(account, input) {
  const o = {
    privacy: PRIVACY.includes(input?.privacy) ? input.privacy : null,
    allowComment: Boolean(input?.allowComment),
    allowDuet: Boolean(input?.allowDuet),
    allowStitch: Boolean(input?.allowStitch),
    disclose: Boolean(input?.disclose),
    yourBrand: Boolean(input?.disclose && input?.yourBrand),
    brandedContent: Boolean(input?.disclose && input?.brandedContent),
    consent: Boolean(input?.consent),
  };
  if (!o.privacy) return { error: 'Choose who can see this TikTok.' };
  if (o.disclose && !o.yourBrand && !o.brandedContent) return { error: 'You turned on content disclosure, so choose “Your brand”, “Branded content” or both.' };
  if (o.brandedContent && o.privacy === 'SELF_ONLY') return { error: 'Branded content can’t be posted as “Only me”. Choose another privacy setting.' };
  if (!o.consent) return { error: 'Confirm TikTok’s music usage terms to post.' };
  try {
    const info = await creatorInfo(await accessToken(account));
    if (!(info.privacy_level_options || []).includes(o.privacy)) return { error: 'That privacy setting isn’t available on your TikTok right now. Choose another.' };
  } catch (err) {
    return { error: err.message.replace(/^[^:]+ failed: /, '') + '.' };
  }
  return { options: o };
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
  const tooLong = captionProblem(ctx.account, text);
  if (tooLong) return { error: tooLong };
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
    update offers set status = 'accepted', method = 'self', caption_final = ${text || null}, checked_at = null,
      accepted_at = now(), publish_error = null, updated_at = now()
    where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning id
  `;
  if (!updated) return { error: 'This offer is no longer open.' };
  await notify('offer_accepted', offerId);
  revalidatePath('/inbox');
  return { ok: true };
}

// Accept and post from pipp, now or at a scheduled time.
// selection: { kind: 'single', assetId } or { kind: 'carousel' } (all campaign files, in the label's order).
// selection: { kind: 'single', assetId } or { kind: 'carousel' } (a carousel on Instagram,
// a photo set of up to 4 on X). options: TikTok's privacy, interaction and disclosure choices.
export async function acceptAndPublish(offerId, selection, caption, scheduledFor, options) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  const text = cleanCaption(caption);
  if (needsApproval(ctx, text)) return { error: 'You changed the caption, so send it to the client for approval first.' };
  const tooLong = captionProblem(ctx.account, text);
  if (tooLong) return { error: tooLong };
  const platform = platformOf(ctx.account);
  const rules = POSTING[platform];

  const all = await ctx.sql`
    select * from campaign_assets where campaign_id = ${ctx.campaign.id} order by sort_order, created_at
  `;
  let assets;
  if (selection?.kind === 'carousel') {
    if (!rules.multi) return { error: 'Choose one file to post.' };
    assets = all.filter((a) => isPublishable(a.content_type) && (!rules.multiPhotosOnly || a.content_type.startsWith('image/'))).slice(0, rules.multi);
    if (assets.length < 2) return { error: `A ${rules.multiName} needs at least two ${rules.multiPhotosOnly ? 'photos' : 'photos or videos'}.` };
  } else {
    const one = all.find((a) => a.id === String(selection?.assetId || ''));
    if (!one || !isPublishable(one.content_type)) return { error: 'Choose one of the campaign files to post.' };
    assets = [one];
  }
  const problem = postingProblem(platform, assets);
  if (problem) return { error: problem.charAt(0).toUpperCase() + problem.slice(1) + '.' };
  let postOptions = null;
  if (platform === 'tiktok') {
    const checked = await tiktokOptions(ctx.account, options);
    if (checked.error) return checked;
    postOptions = checked.options;
  }
  const kind = assets.length > 1 ? 'carousel' : 'single';
  const assetIds = assets.map((a) => a.id);

  if (scheduledFor) {
    const at = new Date(scheduledFor);
    const ms = at.getTime() - Date.now();
    if (Number.isNaN(ms) || ms < 2 * 60 * 1000) return { error: 'Choose a time at least a few minutes from now.' };
    if (ms > 60 * 24 * 60 * 60 * 1000) return { error: 'Schedule within the next 60 days.' };
    const [updated] = await ctx.sql`
      update offers set status = 'scheduled', method = 'app', caption_final = ${text || null}, asset_id = ${assetIds[0]},
        asset_ids = ${ctx.sql.json(assetIds)}, post_kind = ${kind}, scheduled_for = ${at}, accepted_at = now(),
        post_options = ${postOptions ? ctx.sql.json(postOptions) : null},
        publish_error = null, updated_at = now()
      where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning id
    `;
    if (!updated) return { error: 'This offer is no longer open.' };
    await notify('offer_accepted', offerId);
    revalidatePath('/inbox');
    return { ok: true, scheduled: true };
  }

  const [claimed] = await ctx.sql`
    update offers set status = 'publishing', method = 'app', caption_final = ${text || null}, asset_id = ${assetIds[0]},
      asset_ids = ${ctx.sql.json(assetIds)}, post_kind = ${kind}, scheduled_for = null, accepted_at = now(),
      post_options = ${postOptions ? ctx.sql.json(postOptions) : null},
      container_id = null, carousel_items = null, publish_error = null, updated_at = now()
    where id = ${offerId} and status in ${ctx.sql(OPEN_FOR_PAGE)} returning *
  `;
  if (!claimed) return { error: 'This offer is no longer open.' };
  const result = await startCampaignPublish(claimed, ctx.account, assets);
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
