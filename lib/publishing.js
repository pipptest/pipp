import { db } from './db';
import { decrypt } from './crypto';
import { instagramRatio, toInstagramJpeg } from './image';
import { containerStatus, createContainer, publishImage, publishWhenReady } from './instagram';
import { PUBLIC, UPLOADS, download, putPublic, remove, signedDownload } from './storage';

const IMAGE = /^image\/(jpeg|png|webp)$/;
const VIDEO = /^video\/(mp4|quicktime)$/;
export const MAX_CAROUSEL = 10;

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

// Starts publishing a campaign post for an offer already marked 'publishing'.
// assets: one file for a single post, or 2-10 files (in order) for a carousel.
// Photos usually finish within seconds; videos are finished later by the scheduler.
export async function startCampaignPublish(offer, account, assets) {
  const sql = await db();
  const caption = offer.caption_final || offer.caption_draft || '';
  try {
    const token = decrypt(account.access_token_enc);
    const list = Array.isArray(assets) ? assets : [assets];
    if (!list.length || list.some((a) => !a || !isPublishable(a.content_type))) {
      throw new Error('Preparing the post failed: one of the files cannot be posted from pipp');
    }

    if (list.length === 1) {
      const [asset] = list;
      let publicPath = null;
      let containerId;
      if (IMAGE.test(asset.content_type)) {
        publicPath = `${account.ig_user_id}/${offer.id}.jpg`;
        const imageUrl = await putPublic(publicPath, await toInstagramJpeg(await download(asset.path)), 'image/jpeg');
        containerId = await createContainer(token, account.ig_user_id, { imageUrl, caption });
      } else {
        const videoUrl = await signedDownload(asset.path, null, 60 * 60 * 24);
        containerId = await createContainer(token, account.ig_user_id, { videoUrl, caption });
      }
      [offer] = await sql`
        update offers set container_id = ${containerId}, public_path = ${publicPath}, updated_at = now()
        where id = ${offer.id} returning *
      `;
      const post = await publishWhenReady(token, account.ig_user_id, containerId, { tries: IMAGE.test(asset.content_type) ? 8 : 2 });
      return post ? await markPosted(offer, post) : offer;
    }

    // Carousel: one container per slide, in order, all photos cropped to the first photo's shape.
    if (list.length > MAX_CAROUSEL) throw new Error(`Preparing the post failed: a carousel can have at most ${MAX_CAROUSEL} files`);
    const firstImage = list.find((a) => IMAGE.test(a.content_type));
    const ratio = firstImage ? await instagramRatio(await download(firstImage.path)) : 1;
    const items = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const asset = list[i];
        if (IMAGE.test(asset.content_type)) {
          const publicPath = `${account.ig_user_id}/${offer.id}-${i + 1}.jpg`;
          const imageUrl = await putPublic(publicPath, await toInstagramJpeg(await download(asset.path), { ratio }), 'image/jpeg');
          items.push({ id: await createContainer(token, account.ig_user_id, { imageUrl, carouselItem: true }), public_path: publicPath });
        } else {
          const videoUrl = await signedDownload(asset.path, null, 60 * 60 * 24);
          items.push({ id: await createContainer(token, account.ig_user_id, { videoUrl, carouselItem: true }), public_path: null });
        }
      }
    } finally {
      [offer] = await sql`
        update offers set carousel_items = ${sql.json(items)}, updated_at = now() where id = ${offer.id} returning *
      `;
    }
    return await continueCarousel(offer, token, account, { quick: true });
  } catch (err) {
    return markFailed(offer, err);
  }
}

// Builds and publishes the carousel once every slide has finished processing.
async function continueCarousel(offer, token, account, { quick = false } = {}) {
  const sql = await db();
  if (!offer.container_id) {
    for (let round = 0; round < (quick ? 6 : 1); round++) {
      const states = await Promise.all(offer.carousel_items.map((item) => containerStatus(token, item.id)));
      if (states.some((s) => s.code === 'ERROR' || s.code === 'EXPIRED')) {
        throw new Error('Preparing the post failed: Instagram could not process one of the carousel files');
      }
      if (states.every((s) => s.code === 'FINISHED')) {
        const containerId = await createContainer(token, account.ig_user_id, {
          caption: offer.caption_final || offer.caption_draft || '',
          children: offer.carousel_items.map((item) => item.id),
        });
        [offer] = await sql`update offers set container_id = ${containerId}, updated_at = now() where id = ${offer.id} returning *`;
        break;
      }
      if (quick && round < 5) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!offer.container_id) return offer; // still processing; the scheduler continues
  }
  const post = await publishWhenReady(token, account.ig_user_id, offer.container_id, { tries: quick ? 6 : 1 });
  return post ? markPosted(offer, post) : offer;
}

// Called by the scheduler for offers still processing on Instagram's side.
export async function continuePublish(offer, account) {
  try {
    const token = decrypt(account.access_token_enc);
    if (offer.carousel_items?.length) return await continueCarousel(offer, token, account);
    const post = await publishWhenReady(token, account.ig_user_id, offer.container_id, { tries: 1 });
    return post ? markPosted(offer, post) : offer;
  } catch (err) {
    return markFailed(offer, err);
  }
}

async function cleanup(offer) {
  const paths = [offer.public_path, ...(offer.carousel_items || []).map((i) => i.public_path)].filter(Boolean);
  for (const p of paths) await remove(PUBLIC, p).catch(() => {});
}

async function markPosted(offer, post) {
  const sql = await db();
  await cleanup(offer);
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
  await cleanup(offer);
  const [updated] = await sql`
    update offers set status = 'failed', publish_error = ${friendlyPublishError(err)}, public_path = null,
      container_id = null, carousel_items = null, updated_at = now()
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
