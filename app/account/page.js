import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { decrypt } from '../../lib/crypto';
import { currentAccount } from '../../lib/session';
import { isExpired } from '../../lib/tokens';
import { getProfile, getRecentMedia, hasInsightsScope } from '../../lib/instagram';
import FeeForm from './FeeForm';
import { saveSnapshot } from '../../lib/snapshot';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your page · pipp' };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

const TYPES = { BUSINESS: 'Business account', MEDIA_CREATOR: 'Creator account', CREATOR: 'Creator account' };

export default async function Account() {
  const account = await currentAccount();
  if (!account) redirect('/connect');
  const igUserId = account.ig_user_id;
  const sql = await db();

  let profile = account;
  let posts = [];
  let problem = null;
  try {
    const token = decrypt(account.access_token_enc);
    const [fresh, media] = await Promise.all([getProfile(token), getRecentMedia(token)]);
    profile = { ...account, ...fresh };
    posts = media;
    await saveSnapshot(igUserId, media, fresh.followers_count).catch(() => {});
    await sql`
      update instagram_accounts
      set followers_count = ${fresh.followers_count ?? null}, media_count = ${fresh.media_count ?? null}, updated_at = now()
      where ig_user_id = ${igUserId}
    `;
  } catch (err) {
    console.error('Account refresh failed:', err.message);
    problem = 'Could not refresh from Instagram just now. Showing the details saved when you connected.';
  }

  const captioned = posts.filter((p) => p.caption);
  const [{ count: waiting }] = await sql`
    select count(*)::int as count from offers where ig_user_id = ${igUserId} and status = 'sent'
  `;

  return (
    <main>
      <article className="doc">
        <p className="tag">Connected</p>
        <h1>@{profile.username}</h1>
        <p className="date">
          {profile.account_type ? (TYPES[profile.account_type] || 'Professional account') + ' · ' : ''}
          connected {formatDate(account.connected_at)}
        </p>
        {isExpired(account) ? (
          <p className="notice notice-error">
            Your Instagram connection has expired, so pipp can't read or post for this page.{' '}
            <a href="/api/instagram/login">Reconnect Instagram</a>
          </p>
        ) : problem && <p className="notice notice-error">{problem}</p>}

        <div className="stats">
          <div><span>Followers</span><strong>{profile.followers_count?.toLocaleString('en-US') ?? 'Not available'}</strong></div>
          <div><span>Posts</span><strong>{profile.media_count?.toLocaleString('en-US') ?? 'Not available'}</strong></div>
          <div><span>Captions pipp can learn from</span><strong>{captioned.length}</strong></div>
        </div>

        {!account.email && (
          <p className="notice">Add an email below so pipp can tell you when a campaign arrives.</p>
        )}
        {!hasInsightsScope(account) && (
          <p className="notice">
            Reconnect once so pipp can show clients the reach of your campaign posts.{' '}
            <a href="/api/instagram/login">Reconnect Instagram</a>
          </p>
        )}

        <div className="row">
          <a className="button" href="/inbox">Campaign inbox{waiting ? ` (${waiting} new)` : ''}</a>
          <a className="button button-small" href="/draft">Draft a caption</a>
          <a className="button button-small" href="/publish">Publish a post</a>
        </div>

        <FeeForm currentFee={account.fee_cents != null ? String(account.fee_cents / 100) : ''} currentEmail={account.email || ''} />

        <h2>Recent captions</h2>
        {captioned.length === 0 ? (
          <p>No captioned posts yet. pipp needs a few to learn how your page writes.</p>
        ) : (
          <ul className="captions">
            {captioned.map((p) => (
              <li key={p.id}>
                <p>{p.caption}</p>
                <span>
                  {formatDate(p.timestamp)} · {p.media_type.toLowerCase().replace('_', ' ').replace('carousel album', 'carousel')}
                  {typeof p.like_count === 'number' ? ` · ${p.like_count} likes` : ''}
                  {' · '}<a href={p.permalink} target="_blank" rel="noreferrer">View on Instagram</a>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form action="/api/instagram/disconnect" method="post">
          <button className="button button-quiet" type="submit">Disconnect and delete my data</button>
        </form>
      </article>
    </main>
  );
}
