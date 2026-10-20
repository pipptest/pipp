'use server';

import { draftCaptions } from '../../lib/drafting';
import { platformOf, recentPosts } from '../../lib/platforms';
import { currentPage } from '../../lib/session';

export async function draftAction(_prev, formData) {
  const brief = String(formData.get('brief') || '').trim().slice(0, 2000);
  const extras = String(formData.get('extras') || '').trim().slice(0, 500);
  const values = { brief, extras, account: String(formData.get('account') || '') };
  if (brief.length < 10) return { values, error: 'Add a brief of at least a sentence.' };

  const page = await currentPage();
  if (!page) return { values, error: 'Your connection has ended. Connect your page again.' };
  const account = page.accounts.find((a) => a.ig_user_id === values.account) || page.account;

  try {
    const media = await recentPosts(account, { limit: 20 });
    const captions = media.map((m) => m.caption).filter(Boolean).slice(0, 15);
    const drafts = await draftCaptions({ username: account.username, platform: platformOf(account), captions, brief, extras });
    return { values, drafts, basedOn: captions.length };
  } catch (err) {
    console.error('Drafting failed:', err.message);
    return { values, error: 'Drafting failed. Try again in a moment.' };
  }
}
