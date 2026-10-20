import { db } from './db';
import { sendEmail, siteUrl } from './email';
import { dollars } from './money';

// Looks up everyone involved in an offer, for emails.
async function context(offerId) {
  const sql = await db();
  const [row] = await sql`
    select o.*, c.name as campaign_name, c.id as campaign_id, cl.email as client_email, cl.name as client_name,
      a.username, a.platform, a.email as page_email
    from offers o
    join campaigns c on c.id = o.campaign_id
    join clients cl on cl.id = c.client_id
    left join instagram_accounts a on a.ig_user_id = o.ig_user_id
    where o.id = ${offerId}
  `;
  return row;
}

const LABELS = { instagram: 'Instagram', x: 'X', tiktok: 'TikTok' };

// "@name (X)": which account an email is about.
function who(r) {
  return `@${r.username} (${LABELS[r.platform] || 'Instagram'})`;
}

function when(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short',
  });
}

const TEMPLATES = {
  // To pages
  new_offer: (r) => ({
    to: r.page_email,
    subject: `New paid campaign: ${r.campaign_name} (${dollars(r.fee_cents)})`,
    text: `${r.client_name} wants ${who(r)} to post "${r.campaign_name}" for ${dollars(r.fee_cents)}.\n\nA caption is already drafted in your voice. Review it here:\n${siteUrl()}/inbox/${r.id}${r.expires_at ? `\n\nPlease reply by ${when(r.expires_at)}.` : ''}`,
  }),
  caption_approved: (r) => ({
    to: r.page_email,
    subject: `Caption approved: ${r.campaign_name}`,
    text: `${r.client_name} approved your caption for "${r.campaign_name}". You can post it now or schedule it:\n${siteUrl()}/inbox/${r.id}`,
  }),
  changes_requested: (r) => ({
    to: r.page_email,
    subject: `Changes requested: ${r.campaign_name}`,
    text: `${r.client_name} asked for changes to your caption for "${r.campaign_name}".${r.approval_note ? `\n\nTheir note: "${r.approval_note}"` : ''}\n\n${siteUrl()}/inbox/${r.id}`,
  }),
  page_published: (r) => ({
    to: r.page_email,
    subject: `Posted: ${r.campaign_name}`,
    text: `Your post for "${r.campaign_name}" is live on ${who(r)}.${r.permalink ? `\n\n${r.permalink}` : ''}\n\nYou are owed ${dollars(r.fee_cents)}.`,
  }),
  page_failed: (r) => ({
    to: r.page_email,
    subject: `Post failed: ${r.campaign_name}`,
    text: `pipp couldn't post "${r.campaign_name}" to ${who(r)}. Nothing was posted.\n\n${r.publish_error || ''}\n\nYou can try again here:\n${siteUrl()}/inbox/${r.id}`,
  }),
  // To clients
  approval_needed: (r) => ({
    to: r.client_email,
    subject: `Approve a caption: ${who(r)} for ${r.campaign_name}`,
    text: `${who(r)} edited the caption for "${r.campaign_name}" and needs your approval before posting:\n\n"${r.caption_final}"\n\nApprove or ask for changes:\n${siteUrl()}/c/${r.campaign_id}`,
  }),
  offer_accepted: (r) => ({
    to: r.client_email,
    subject: `${who(r)} accepted ${r.campaign_name}`,
    text: `${who(r)} accepted "${r.campaign_name}"${r.scheduled_for ? ` and scheduled it for ${when(r.scheduled_for)}` : ''}.\n\n${siteUrl()}/c/${r.campaign_id}`,
  }),
  offer_declined: (r) => ({
    to: r.client_email,
    subject: `${who(r)} declined ${r.campaign_name}`,
    text: `${who(r)} declined "${r.campaign_name}". You won't owe them anything.\n\n${siteUrl()}/c/${r.campaign_id}`,
  }),
  offer_expired: (r) => ({
    to: r.client_email,
    subject: `No reply from ${who(r)}: ${r.campaign_name}`,
    text: `${who(r)} didn't reply to "${r.campaign_name}" in time, so the offer expired. You won't owe them anything.\n\n${siteUrl()}/c/${r.campaign_id}`,
  }),
  post_live: (r) => ({
    to: r.client_email,
    subject: `Live: ${who(r)} posted ${r.campaign_name}`,
    text: `${who(r)}'s post for "${r.campaign_name}" is live.${r.permalink ? `\n\n${r.permalink}` : ''}\n\nResults will appear on your campaign page:\n${siteUrl()}/c/${r.campaign_id}`,
  }),
};

export async function notify(kind, offerId) {
  try {
    const row = await context(offerId);
    if (!row || !TEMPLATES[kind]) return;
    const email = TEMPLATES[kind](row);
    await sendEmail(email);
  } catch (err) {
    console.error(`Notify ${kind} failed:`, err.message);
  }
}

// Emails both sides when an offer goes live.
export async function notifyPosted(offerId) {
  await Promise.all([notify('post_live', offerId), notify('page_published', offerId)]);
}
