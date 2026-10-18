import { decrypt } from './crypto';
import { toInstagramJpeg } from './image';
import { publishImage } from './instagram';
import { PUBLIC, UPLOADS, download, putPublic, remove } from './storage';

// Converts a stored photo for Instagram, publishes it to the account, and cleans up
// the temporary public copy. Keeps the original unless deleteSource is set.
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

export function friendlyPublishError(err) {
  const m = String(err?.message || '');
  return m.startsWith('Publishing') || m.startsWith('Preparing')
    ? m
    : 'Publishing failed. Nothing was posted. Try again in a moment.';
}
