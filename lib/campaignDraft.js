import { draftCaptions } from './drafting';
import { platformOf, recentPosts } from './platforms';

// Drafts one caption for a campaign in the account's own voice.
export async function writeDraft(account, campaign) {
  const media = await recentPosts(account, { limit: 20 });
  const captions = media.map((m) => m.caption).filter(Boolean).slice(0, 15);
  const extras = [campaign.extras, campaign.link ? `Link: ${campaign.link}` : null].filter(Boolean).join('\n');
  const drafts = await draftCaptions({ username: account.username, platform: platformOf(account), captions, brief: campaign.brief, extras });
  return drafts[0];
}
