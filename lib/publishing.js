import { db } from './db';
import { decrypt } from './crypto';
import { instagramRatio, toInstagramJpeg, toPlainJpeg } from './image';
import { containerStatus, createContainer, publishImage, publishWhenReady } from './instagram';
import { POSTING, accessToken, platformOf } from './platforms';
import * as tt from './tiktok';
import * as x from './x';
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

// Checks the chosen files suit the platform. Returns an error message or null.
export function postingProblem(platform, list) {
  const rules = POSTING[platform] || POSTING.instagram;
  if (!list.length || list.some((a) => !a || !isPublishable(a.content_type))) return 'one of the files cannot be posted from pipp';
  if (rules.videoOnly && (list.length !== 1 || !VIDEO.test(list[0].content_type))) return 'TikTok posts from pipp must be one video';
  if (list.length > 1) {
    if (!rules.multi) return 'this platform takes one file per post';
    if (list.length > rules.multi) return `a ${rules.multiName} can have at most ${rules.multi} files`;
    if (rules.multiPhotosOnly && list.some((a) => !IMAGE.test(a.content_type))) return `an X ${rules.multiName} can only contain photos`;
  }
  return null;
}

// Starts publishing a campaign post for an offer already marked 'publishing'.
// assets: one file for a single post, or several (in order) for a carousel or photo set.
// Photos usually finish within seconds; videos are finished later by the scheduler.
export async function startCampaignPublish(offer, account, assets) {
  const list = Array.isArray(assets) ? assets : [assets];
  const problem = postingProblem(platformOf(account), list);
  if (problem) return markFailed(offer, new Error(`Preparing the post failed: ${problem}`));
  if (platformOf(account) === 'x') return startX(offer, account, list);
  if (platformOf(account) === 'tiktok') return startTikTok(offer, account, list);
  return startInstagram(offer, account, list);
}

async function startInstagram(offer, account, list) {
  const sql = await db();
  const caption = offer.caption_final || offer.caption_draft || '';
  try {
    const token = decrypt(account.access_token_enc);

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

// Called by the scheduler for offers still processing on the platform's side.
export async function continuePublish(offer, account) {
  try {
    if (platformOf(account) === 'x') return await continueX(offer, await accessToken(account), account);
    if (platformOf(account) === 'tiktok') return await continueTikTok(offer, await accessToken(account), account);
    const token = decrypt(account.access_token_enc);
    if (offer.carousel_items?.length) return await continueCarousel(offer, token, account);
    const post = await publishWhenReady(token, account.ig_user_id, offer.container_id, { tries: 1 });
    return post ? markPosted(offer, post) : offer;
  } catch (err) {
    return markFailed(offer, err);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const videoType = (a) => (a.content_type === 'video/quicktime' ? 'video/quicktime' : 'video/mp4');

// X: upload each file, wait for videos to process, then create the post.
async function startX(offer, account, list) {
  const sql = await db();
  try {
    const caption = offer.caption_final || offer.caption_draft || '';
    const length = x.postLength(caption);
    if (length > x.maxLength(account)) {
      throw new Error(`Preparing the post failed: the caption is ${length} characters and X allows ${x.maxLength(account)}`);
    }
    const token = await accessToken(account);
    const items = [];
    try {
      for (const asset of list) {
        const up = IMAGE.test(asset.content_type)
          ? await x.uploadMedia(token, await toPlainJpeg(await download(asset.path)), 'image/jpeg', 'tweet_image')
          : await x.uploadMedia(token, await download(asset.path), videoType(asset), 'tweet_video');
        items.push({ id: up.id, state: up.state, public_path: null });
      }
    } finally {
      [offer] = await sql`update offers set carousel_items = ${sql.json(items)}, updated_at = now() where id = ${offer.id} returning *`;
    }
    return await continueX(offer, token, account, { quick: true });
  } catch (err) {
    return markFailed(offer, err);
  }
}

async function continueX(offer, token, account, { quick = false } = {}) {
  const sql = await db();
  try {
    if (offer.container_id === 'posting') {
      // A previous run started creating the post and never recorded the result.
      if (Date.now() - new Date(offer.updated_at).getTime() < 10 * 60 * 1000) return offer;
      throw new Error('Publishing may not have finished. Check your X profile before trying again');
    }
    let items = offer.carousel_items || [];
    for (let round = 0; round < (quick ? 6 : 1); round++) {
      items = await Promise.all(items.map(async (i) => (i.state === 'succeeded' ? i : { ...i, state: await x.mediaState(token, i.id) })));
      if (items.some((i) => i.state === 'failed')) throw new Error('Preparing the post failed: X could not process one of the files');
      if (items.every((i) => i.state === 'succeeded')) break;
      if (quick && round < 5) await sleep(2000);
    }
    if (!items.every((i) => i.state === 'succeeded')) {
      [offer] = await sql`update offers set carousel_items = ${sql.json(items)}, updated_at = now() where id = ${offer.id} returning *`;
      return offer; // still processing; the scheduler continues
    }
    // Claim the post so two runs can never create it twice.
    const [claimed] = await sql`
      update offers set container_id = 'posting', carousel_items = ${sql.json(items)}, updated_at = now()
      where id = ${offer.id} and container_id is null returning *
    `;
    if (!claimed) return offer;
    const post = await x.createPost(token, account.username, claimed.caption_final || claimed.caption_draft || '', items.map((i) => i.id));
    return await markPosted(claimed, post);
  } catch (err) {
    return markFailed(offer, err);
  }
}

// TikTok: check the creator's settings, upload the video, then wait for TikTok to post it.
async function startTikTok(offer, account, list) {
  const sql = await db();
  try {
    const [asset] = list;
    const token = await accessToken(account);
    const info = await tt.creatorInfo(token);
    const o = offer.post_options || {};
    if (!o.privacy || !(info.privacy_level_options || []).includes(o.privacy)) {
      throw new Error('Preparing the post failed: that privacy setting is no longer available on your TikTok. Choose it again');
    }
    if (o.brandedContent && o.privacy === 'SELF_ONLY') {
      throw new Error('Preparing the post failed: branded content can’t be posted as “Only me”');
    }
    const video = await download(asset.path);
    const { publish_id: publishId, upload_url: uploadUrl } = await tt.initVideo(token, {
      title: String(offer.caption_final || offer.caption_draft || '').slice(0, 2200),
      privacy_level: o.privacy,
      disable_comment: !o.allowComment || Boolean(info.comment_disabled),
      disable_duet: !o.allowDuet || Boolean(info.duet_disabled),
      disable_stitch: !o.allowStitch || Boolean(info.stitch_disabled),
      brand_content_toggle: Boolean(o.brandedContent),
      brand_organic_toggle: Boolean(o.yourBrand),
    }, video.length);
    [offer] = await sql`update offers set container_id = ${publishId}, updated_at = now() where id = ${offer.id} returning *`;
    await tt.uploadVideo(uploadUrl, video, videoType(asset));
    return await continueTikTok(offer, token, account, { quick: true });
  } catch (err) {
    return markFailed(offer, err);
  }
}

async function continueTikTok(offer, token, account, { quick = false } = {}) {
  try {
    for (let round = 0; round < (quick ? 4 : 1); round++) {
      const s = await tt.publishStatus(token, offer.container_id);
      if (s.status === 'PUBLISH_COMPLETE') {
        const id = s.post_ids[0];
        return await markPosted(offer, {
          id: id || offer.container_id,
          permalink: id ? `https://www.tiktok.com/@${account.username}/video/${id}` : null,
        });
      }
      if (s.status === 'FAILED') throw new Error(`Publishing failed: TikTok couldn’t post the video (${String(s.fail_reason || 'no reason given').replace(/_/g, ' ')})`);
      if (quick && round < 3) await sleep(3000);
    }
    if (!quick && Date.now() - new Date(offer.updated_at).getTime() > 2 * 60 * 60 * 1000) {
      throw new Error('Publishing failed: TikTok didn’t finish posting within two hours. Check your TikTok profile before trying again');
    }
    return offer;
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
    : /connection has ended|Reconnect/i.test(m)
      ? m
      : 'Publishing failed. Nothing was posted. Try again in a moment.';
}
