import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { hasInsightsScope } from '../../lib/instagram';
import { PLATFORMS, PLATFORM_ORDER, platformLabel, platformOf, profileUrl } from '../../lib/platforms';
import { currentPage } from '../../lib/session';
import { refreshStats } from '../../lib/snapshot';
import { isExpired } from '../../lib/tokens';
import FeeForm from './FeeForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your page · pipp' };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

const TYPES = { BUSINESS: 'Business account', MEDIA_CREATOR: 'Creator account', CREATOR: 'Creator account' };
const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : 'Not available');

const POSTS_WORD = { instagram: 'Posts', x: 'Posts', tiktok: 'Videos' };

export default async function Account({ searchParams }) {
  const page = await currentPage();
  if (!page) redirect('/connect');
  const params = await searchParams;
  const sql = await db();

  const accounts = await Promise.all(page.accounts.map(async (a) => {
    if (isExpired(a)) return { ...a, problem: 'expired' };
    try {
      return await refreshStats(a);
    } catch (err) {
      console.error(`Account refresh failed for @${a.username}:`, err.message);
      return { ...a, problem: /connection has ended|Reconnect|invalid|revoked/i.test(err.message) ? 'expired' : 'refresh' };
    }
  }));

  const [{ count: waiting }] = await sql`
    select count(*)::int as count from offers where ig_user_id in ${sql(page.keys)} and status = 'sent'
  `;
  const linked = new Set(accounts.map(platformOf));
  const canLink = PLATFORM_ORDER.filter((p) => !linked.has(p));
  const email = accounts.find((a) => a.email)?.email || '';

  return (
    <main>
      <article className="doc">
        <p className="tag">Your page on pipp</p>
        <h1>@{page.account.username}</h1>
        <p className="date">
          {accounts.length === 1 ? '1 account linked' : `${accounts.length} accounts linked`} · clients can book each one separately
        </p>
        {params?.linked && PLATFORMS[params.linked] && <p className="notice">{PLATFORMS[params.linked].label} is linked. Set a fee for it below to start taking campaigns there.</p>}
        {params?.unlinked && <p className="notice">That account was disconnected and its data deleted from pipp.</p>}
        {params?.need === 'instagram' && <p className="notice">Publishing a standalone post works with Instagram. Link Instagram below to use it.</p>}

        <ul className="accounts">
          {accounts.map((a) => {
            const platform = platformOf(a);
            const recent = a.snapshot?.recent || [];
            return (
              <li key={a.id} className="account-card">
                <div className="row row-between">
                  <div>
                    <span className={`platform platform-${platform}`}>{platformLabel(a)}</span>{' '}
                    <strong><a href={profileUrl(a)} target="_blank" rel="noreferrer">@{a.username}</a></strong>
                    <span className="muted">
                      {' '}{platform === 'instagram' && a.account_type ? `${TYPES[a.account_type] || 'Professional account'} · ` : ''}
                      linked {formatDate(a.connected_at)}
                    </span>
                  </div>
                  <form action="/api/accounts/disconnect" method="post">
                    <input type="hidden" name="account" value={a.ig_user_id} />
                    <button className="link-button" type="submit">Disconnect</button>
                  </form>
                </div>
                {a.problem === 'expired' && (
                  <p className="notice notice-error">
                    This {platformLabel(a)} connection has ended, so pipp can't read or post for it.{' '}
                    <a href={PLATFORMS[platform].loginPath}>Reconnect {platformLabel(a)}</a>
                  </p>
                )}
                {a.problem === 'refresh' && <p className="small">Couldn’t refresh from {platformLabel(a)} just now. Showing saved details.</p>}
                {platform === 'instagram' && !hasInsightsScope(a) && (
                  <p className="notice">
                    Reconnect once so pipp can show clients the reach of your campaign posts.{' '}
                    <a href="/api/instagram/login">Reconnect Instagram</a>
                  </p>
                )}
                {platform === 'tiktok' && (
                  <p className="small">Until TikTok finishes reviewing pipp, videos posted from pipp are visible only to you. Posting it yourself works as normal.</p>
                )}
                <div className="stats">
                  <div><span>Followers</span><strong>{num(a.followers_count)}</strong></div>
                  <div><span>{POSTS_WORD[platform]}</span><strong>{num(a.media_count)}</strong></div>
                  <div><span>Fee per post</span><strong>{a.fee_cents != null ? `$${(a.fee_cents / 100).toLocaleString('en-US')}` : 'Not set'}</strong></div>
                </div>
                {recent.length > 0 && (
                  <details>
                    <summary>Recent captions pipp learns from ({recent.length})</summary>
                    <ul className="captions">
                      {recent.slice(0, 5).map((p) => (
                        <li key={p.id}>
                          <p>{p.caption}</p>
                          <span>
                            {formatDate(p.timestamp)}
                            {typeof p.like_count === 'number' ? ` · ${p.like_count.toLocaleString('en-US')} likes` : ''}
                            {p.permalink && <>{' · '}<a href={p.permalink} target="_blank" rel="noreferrer">View</a></>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>

        {canLink.length > 0 && (
          <section className="card">
            <h2>Link another account</h2>
            <p className="small">Run X or TikTok accounts too? Link them here so campaigns for every account land in one inbox.</p>
            <div className="row">
              {canLink.map((p) => (
                PLATFORMS[p].configured()
                  ? <a key={p} className="button button-small" href={PLATFORMS[p].loginPath}>Link {PLATFORMS[p].label}</a>
                  : <span key={p} className="button button-small is-disabled" aria-disabled="true">{PLATFORMS[p].label} coming soon</span>
              ))}
            </div>
          </section>
        )}

        {!email && <p className="notice">Add an email below so pipp can tell you when a campaign arrives.</p>}

        <div className="row">
          <a className="button" href="/inbox">Campaign inbox{waiting ? ` (${waiting} new)` : ''}</a>
          <a className="button button-small" href="/draft">Draft a caption</a>
          {linked.has('instagram') && <a className="button button-small" href="/publish">Publish an Instagram post</a>}
        </div>

        <FeeForm
          accounts={accounts.map((a) => ({
            key: a.ig_user_id, username: a.username, label: platformLabel(a),
            fee: a.fee_cents != null ? String(a.fee_cents / 100) : '',
          }))}
          currentEmail={email}
        />

        <form action="/api/accounts/disconnect" method="post">
          <input type="hidden" name="account" value="all" />
          <button className="button button-quiet" type="submit">Disconnect everything and delete my data</button>
        </form>
      </article>
    </main>
  );
}
