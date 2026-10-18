'use server';

import { decrypt } from '../../lib/crypto';
import { toInstagramJpeg } from '../../lib/image';
import { publishImage } from '../../lib/instagram';
import { currentAccount } from '../../lib/session';
import { UPLOADS, PUBLIC, download, newPath, putPublic, remove, signedUpload } from '../../lib/storage';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Step 1: give the browser a one-time link to upload the photo straight to storage.
export async function prepareUpload(contentType) {
  const account = await currentAccount();
  if (!account) return { error: 'Your Instagram connection has ended. Connect your page again.' };
  const ext = TYPES[contentType];
  if (!ext) return { error: 'Use a JPEG, PNG or WebP photo.' };
  try {
    const path = newPath(account.ig_user_id, ext);
    return { path, url: await signedUpload(path) };
  } catch (err) {
    console.error('Upload setup failed:', err.message);
    return { error: 'Could not start the upload. Try again in a moment.' };
  }
}

// Step 2: after the person confirms, convert the photo for Instagram and publish it.
export async function publishPost({ path, caption }) {
  const account = await currentAccount();
  if (!account) return { error: 'Your Instagram connection has ended. Connect your page again.' };
  if (typeof path !== 'string' || !path.startsWith(account.ig_user_id + '/') || path.includes('..')) {
    return { error: 'That upload does not belong to this page.' };
  }
  const text = String(caption || '').slice(0, 2200);

  let publicPath;
  try {
    const jpeg = await toInstagramJpeg(await download(path));
    publicPath = path.replace(/\.[a-z]+$/, '') + '.jpg';
    const imageUrl = await putPublic(publicPath, jpeg, 'image/jpeg');
    const post = await publishImage(decrypt(account.access_token_enc), account.ig_user_id, imageUrl, text);
    return { ok: true, permalink: post.permalink };
  } catch (err) {
    console.error('Publishing failed:', err.message);
    return { error: err.message.startsWith('Publishing') || err.message.startsWith('Preparing')
      ? err.message
      : 'Publishing failed. Nothing was posted. Try again in a moment.' };
  } finally {
    await remove(UPLOADS, path).catch(() => {});
    if (publicPath) await remove(PUBLIC, publicPath).catch(() => {});
  }
}
