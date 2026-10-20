import { PLATFORMS, PLATFORM_ORDER } from '../../lib/platforms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connect your page · pipp' };

const ERRORS = {
  not_configured: (p) => `pipp isn't connected to ${p} yet. The app keys still need to be added.`,
  denied: (p) => `You cancelled the connection on ${p}. Nothing was saved.`,
  state: () => 'That connection attempt expired or did not match. Please try again.',
  exchange: (p) => (p === 'Instagram'
    ? 'Instagram did not accept the connection. Check the account is a professional account added as a tester, then try again.'
    : `${p} did not accept the connection. Try again in a moment.`),
  x_credits: () => 'pipp’s X API credits have run out, so X can’t be connected right now.',
};

const NOTES = {
  instagram: 'Professional accounts (Business or Creator)',
  x: 'Any X account',
  tiktok: 'Any TikTok account',
};

export default async function Connect({ searchParams }) {
  const params = await searchParams;
  const label = PLATFORMS[params?.platform]?.label || 'Instagram';
  const error = ERRORS[params?.error]?.(label);

  return (
    <main>
      <article className="doc">
        <h1>Connect your page</h1>
        <p className="date">Instagram, X or TikTok. Start with one; you can link the others from your page.</p>

        {params?.disconnected && <p className="notice">Your accounts were disconnected and their data deleted from pipp.</p>}
        {error && <p className="notice notice-error">{error}</p>}

        <p>
          Connecting lets pipp read your profile and recent posts, so it can draft captions in your voice, and
          lets you publish campaign posts with one tap. pipp never posts without your confirmation.
        </p>

        <ul className="connect-list">
          {PLATFORM_ORDER.map((p) => (
            <li key={p}>
              <span>
                <strong>{PLATFORMS[p].label}</strong>
                <span className="muted">{NOTES[p]}</span>
              </span>
              {PLATFORMS[p].configured() ? (
                <a className="button button-small" href={PLATFORMS[p].loginPath}>Connect {PLATFORMS[p].label}</a>
              ) : (
                <span className="button button-small is-disabled" aria-disabled="true">Coming soon</span>
              )}
            </li>
          ))}
        </ul>

        <p className="small">
          You can disconnect at any time. See the <a href="/privacy">privacy policy</a>.
        </p>
      </article>
    </main>
  );
}
