import { isConfigured } from '../../lib/instagram';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connect your page · pipp' };

const ERRORS = {
  not_configured: 'pipp is not connected to Instagram yet. The app keys still need to be added.',
  denied: 'You cancelled the connection on Instagram. Nothing was saved.',
  state: 'That connection attempt expired or did not match. Please try again.',
  exchange: 'Instagram did not accept the connection. Check the account is a professional account added as a tester, then try again.',
};

export default async function Connect({ searchParams }) {
  const params = await searchParams;
  const error = ERRORS[params?.error];
  const ready = isConfigured();

  return (
    <main>
      <article className="doc">
        <h1>Connect your page</h1>
        <p className="date">Instagram professional accounts (Business or Creator)</p>

        {params?.disconnected && <p className="notice">Your account was disconnected and its data deleted from pipp.</p>}
        {error && <p className="notice notice-error">{error}</p>}

        <p>
          Connecting lets pipp read your profile and recent captions, so it can draft captions in your voice, and
          lets you publish campaign posts with one tap. pipp never posts without your confirmation.
        </p>

        {ready ? (
          <a className="button" href="/api/instagram/login">Connect Instagram</a>
        ) : (
          <p className="notice">Connecting opens once the Instagram app keys are added.</p>
        )}

        <p className="small">
          You can disconnect at any time. See the <a href="/privacy">privacy policy</a>.
        </p>
      </article>
    </main>
  );
}
