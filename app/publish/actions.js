'use server';

import { friendlyPublishError, publishFromStorage } from '../../lib/publishing';
import { currentPage } from '../../lib/session';
import { newPath, signedUpload } from '../../lib/storage';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Step 1: give the browser a one-time link to upload the photo straight to storage.
export async function prepareUpload(contentType) {
  const account = (await currentPage())?.accounts.find((a) => a.platform === 'instagram');
  if (!account) return { error: 'Connect Instagram to publish from here.' };
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
  const account = (await currentPage())?.accounts.find((a) => a.platform === 'instagram');
  if (!account) return { error: 'Connect Instagram to publish from here.' };
  if (typeof path !== 'string' || !path.startsWith(account.ig_user_id + '/') || path.includes('..')) {
    return { error: 'That upload does not belong to this page.' };
  }
  try {
    const post = await publishFromStorage(account, path, String(caption || '').slice(0, 2200), { deleteSource: true });
    return { ok: true, permalink: post.permalink };
  } catch (err) {
    console.error('Publishing failed:', err.message);
    return { error: friendlyPublishError(err) };
  }
}
