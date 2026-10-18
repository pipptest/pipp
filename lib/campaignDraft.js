import { decrypt } from './crypto';
import { draftCaptions } from './drafting';
import { getRecentMedia } from './instagram';

// Drafts one caption for a campaign in the page's own voice.
export async function writeDraft(account, campaign) {
  const media = await getRecentMedia(decrypt(account.access_token_enc), 20);
  const captions = media.map((m) => m.caption).filter(Boolean).slice(0, 15);
  const extras = [campaign.extras, campaign.link ? `Link: ${campaign.link}` : null].filter(Boolean).join('\n');
  const drafts = await draftCaptions({ username: account.username, captions, brief: campaign.brief, extras });
  return drafts[0];
}
