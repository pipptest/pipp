'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../lib/db';
import { writeDraft } from '../../lib/campaignDraft';
import { toCents } from '../../lib/money';
import { friendlyPublishError, publishFromStorage } from '../../lib/publishing';
import { currentAccount } from '../../lib/session';

const IMAGE = /^image\/(jpeg|png|webp)$/;

export async function saveFee(_prev, formData) {
  const account = await currentAccount();
  if (!account) return { error: 'Your Instagram connection has ended. Connect again.' };
  const raw = String(formData.get('fee') || '').trim();
  const cents = raw === '' ? null : toCents(raw);
  if (raw !== '' && (cents === null || cents < 100)) return { error: 'Enter a fee of at least $1.', value: raw };
  const sql = await db();
  await sql`update instagram_accounts set fee_cents = ${cents}, updated_at = now() where ig_user_id = ${account.ig_user_id}`;
  revalidatePath('/account');
  return { ok: true, value: raw, message: cents === null ? 'You are no longer taking campaigns.' : 'Saved. Clients can now send you campaigns.' };
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

export async function newDraft(offerId) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  if (ctx.offer.status !== 'sent') return { error: 'This offer is already answered.' };
  try {
    const draft = await writeDraft(ctx.account, ctx.campaign);
    await ctx.sql`update offers set caption_draft = ${draft}, updated_at = now() where id = ${offerId}`;
    return { draft };
  } catch (err) {
    console.error('Drafting failed:', err.message);
    return { error: 'Drafting failed. Try again in a moment.' };
  }
}

export async function declineOffer(offerId) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  if (ctx.offer.status !== 'sent') return { error: 'This offer is already answered.' };
  await ctx.sql`update offers set status = 'declined', updated_at = now() where id = ${offerId}`;
  revalidatePath('/inbox');
  return { ok: true };
}

// Accept and post it yourself: pipp watches the account for the post.
export async function acceptSelf(offerId, caption) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  if (ctx.offer.status !== 'sent') return { error: 'This offer is already answered.' };
  const text = String(caption || '').trim().slice(0, 2200);
  await ctx.sql`
    update offers set status = 'accepted', method = 'self', caption_final = ${text || null},
      accepted_at = now(), updated_at = now()
    where id = ${offerId}
  `;
  revalidatePath('/inbox');
  return { ok: true };
}

// Accept and post from pipp: publishes the chosen campaign photo right away.
export async function acceptAndPublish(offerId, assetId, caption) {
  const ctx = await loadOffer(offerId);
  if (ctx.error) return ctx;
  if (ctx.offer.status !== 'sent') return { error: 'This offer is already answered.' };
  const [asset] = await ctx.sql`
    select * from campaign_assets where id = ${assetId} and campaign_id = ${ctx.campaign.id}
  `;
  if (!asset || !IMAGE.test(asset.content_type)) return { error: 'Choose one of the campaign photos to post.' };
  const text = String(caption || '').trim().slice(0, 2200);

  await ctx.sql`
    update offers set status = 'accepted', method = 'app', caption_final = ${text || null},
      accepted_at = now(), updated_at = now()
    where id = ${offerId}
  `;
  try {
    const post = await publishFromStorage(ctx.account, asset.path, text);
    await ctx.sql`
      update offers set status = 'posted', media_id = ${post.id}, permalink = ${post.permalink},
        posted_at = now(), updated_at = now()
      where id = ${offerId}
    `;
    revalidatePath('/inbox');
    return { ok: true, permalink: post.permalink };
  } catch (err) {
    console.error('Campaign publishing failed:', err.message);
    await ctx.sql`
      update offers set status = 'sent', method = null, accepted_at = null, updated_at = now() where id = ${offerId}
    `;
    return { error: friendlyPublishError(err) };
  }
}
