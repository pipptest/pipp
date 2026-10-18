'use server';

import { decrypt } from '../../lib/crypto';
import { draftCaptions } from '../../lib/drafting';
import { getRecentMedia } from '../../lib/instagram';
import { currentAccount } from '../../lib/session';

export async function draftAction(_prev, formData) {
  const brief = String(formData.get('brief') || '').trim().slice(0, 2000);
  const extras = String(formData.get('extras') || '').trim().slice(0, 500);
  const values = { brief, extras };
  if (brief.length < 10) return { values, error: 'Add a brief of at least a sentence.' };

  const account = await currentAccount();
  if (!account) return { values, error: 'Your Instagram connection has ended. Connect your page again.' };

  try {
    const media = await getRecentMedia(decrypt(account.access_token_enc), 20);
    const captions = media.map((m) => m.caption).filter(Boolean).slice(0, 15);
    const drafts = await draftCaptions({ username: account.username, captions, brief, extras });
    return { values, drafts, basedOn: captions.length };
  } catch (err) {
    console.error('Drafting failed:', err.message);
    return { values, error: 'Drafting failed. Try again in a moment.' };
  }
}
