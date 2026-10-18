import { db } from './db';
import { decrypt } from './crypto';
import { toInstagramJpeg } from './image';
import { createContainer, publishImage, publishWhenReady } from './instagram';
import { PUBLIC, UPLOADS, download, putPublic, remove, signedDownload } from './storage';

const IMAGE = /^image\/(jpeg|png|webp)$/;
const VIDEO = /^video\/(mp4|quicktime)$/;

export function isPublishable(contentType) {
  return IMAGE.test(contentType) || VIDEO.test(contentType);
}

// Standalone photo post (the /publish page): publish now, then clean up.
export async function publishFromStorage(account, path, caption, { deleteSource = false } = {}) {
  const publicPath = `${account.ig_user_id}/${Date.now()}-${path.split('/').pop().replace(/\.[a-z0-9]+$/i, '')}.jpg`;
  try {
    const jpeg = await toInstagramJpeg(await download(path));
    const imageUrl = await putPublic(publicPath, jpeg, 'image/jpeg');
    return await publishImage(decrypt(account.access_token_enc), account.ig_user_id, imageUrl, caption);
  } finally {
    await remove(PUBLIC, publicPath).catch(() => {});
    if (deleteSource) await remove(UPLOADS, path).catch(() => {});
  }
}

// Starts publishing a campaign post for an offer that is already marked 'publishing'.
// Photos usually finish within seconds; videos are finished later by the scheduler.
export async function startCampaignPublish(offer, account, asset) {
  const sql = await db();
  const caption = offer.caption_final || offer.caption_draft || '';
  try {
    const token = decrypt(account.access_token_enc);
    let publicPath = null;
    let containerId;
    if (IMAGE.test(asset.content_type)) {
      publicPath = `${account.ig_user_id}/${offer.id}.jpg`;
      const imageUrl = await putPublic(publicPath, await toInstagramJpeg(await download(asset.path)), 'image/jpeg');
      containerId = await createContainer(token, account.ig_user_id, { imageUrl, caption });
    } else if (VIDEO.test(asset.content_type)) {
      const videoUrl = await signedDownload(asset.path, null, 60 * 60 * 24);
      containerId = await createContainer(token, account.ig_user_id, { videoUrl, caption });
    } else {
      throw new Error('Preparing the post failed: this file type cannot be posted from pipp');
    }
    [offer] = await sql`
      update offers set container_id = ${containerId}, public_path = ${publicPath}, updated_at = now()
      where id = ${offer.id} returning *
    `;
    const post = await publishWhenReady(token, account.ig_user_id, containerId, { tries: IMAGE.test(asset.content_type) ? 8 : 2 });
    if (post) return await markPosted(offer, post);
    return offer;
  } catch (err) {
    return markFailed(offer, err);
  }
}

// Called by the scheduler for offers still processing on Instagram's side.
export async function continuePublish(offer, account) {
  try {
    const post = await publishWhenReady(decrypt(account.access_token_enc), account.ig_user_id, offer.container_id, { tries: 1 });
    return post ? markPosted(offer, post) : offer;
  } catch (err) {
    return markFailed(offer, err);
  }
}

async function markPosted(offer, post) {
  const sql = await db();
  if (offer.public_path) await remove(PUBLIC, offer.public_path).catch(() => {});
  const [updated] = await sql`
    update offers set status = 'posted', media_id = ${post.id}, permalink = ${post.permalink},
      posted_at = now(), public_path = null, publish_error = null, updated_at = now()
    where id = ${offer.id} returning *
  `;
  return updated;
}

async function markFailed(offer, err) {
  console.error('Campaign publishing failed:', err.message);
  const sql = await db();
  if (offer.public_path) await remove(PUBLIC, offer.public_path).catch(() => {});
  const [updated] = await sql`
    update offers set status = 'failed', publish_error = ${friendlyPublishError(err)}, public_path = null, updated_at = now()
    where id = ${offer.id} returning *
  `;
  return updated;
}

export function friendlyPublishError(err) {
  const m = String(err?.message || '');
  return m.startsWith('Publishing') || m.startsWith('Preparing')
    ? m
    : 'Publishing failed. Nothing was posted. Try again in a moment.';
}
