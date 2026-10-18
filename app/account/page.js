import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { decrypt, unsign } from '../../lib/crypto';
import { getProfile, getRecentMedia } from '../../lib/instagram';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your page · pipp' };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

const TYPES = { BUSINESS: 'Business account', MEDIA_CREATOR: 'Creator account', CREATOR: 'Creator account' };

export default async function Account() {
  const igUserId = unsign((await cookies()).get('pipp_session')?.value);
  if (!igUserId) redirect('/connect');

  const sql = await db();
  const [account] = await sql`select * from instagram_accounts where ig_user_id = ${igUserId}`;
  if (!account) redirect('/connect');

  let profile = account;
  let posts = [];
  let problem = null;
  try {
    const token = decrypt(account.access_token_enc);
    const [fresh, media] = await Promise.all([getProfile(token), getRecentMedia(token)]);
    profile = { ...account, ...fresh };
    posts = media;
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

  return (
    <main>
      <article className="doc">
        <p className="tag">Connected</p>
        <h1>@{profile.username}</h1>
        <p className="date">
          {profile.account_type ? (TYPES[profile.account_type] || 'Professional account') + ' · ' : ''}
          connected {formatDate(account.connected_at)}
        </p>
        {problem && <p className="notice notice-error">{problem}</p>}

        <div className="stats">
          <div><span>Followers</span><strong>{profile.followers_count?.toLocaleString('en-US') ?? 'Not available'}</strong></div>
          <div><span>Posts</span><strong>{profile.media_count?.toLocaleString('en-US') ?? 'Not available'}</strong></div>
          <div><span>Captions pipp can learn from</span><strong>{captioned.length}</strong></div>
        </div>

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
