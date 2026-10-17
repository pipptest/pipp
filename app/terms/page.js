import { SITE } from '../site';

export const metadata = { title: 'Terms · pipp' };

export default function Terms() {
  return (
    <main>
      <article className="doc">
        <h1>Terms of use</h1>
        <p className="date">Last updated {SITE.policyDate}</p>

        <p>
          pipp is in a private beta. By using it you agree to these terms. They will be replaced by full terms
          before pipp opens to the public.
        </p>

        <h2>Using pipp</h2>
        <ul>
          <li>You must only connect accounts you own or are authorised to manage.</li>
          <li>Pages decide which campaigns to accept. Nothing is posted to a page's account without its confirmation.</li>
          <li>Clients must own or have the rights to the photos, videos and music they upload.</li>
          <li>
            Pages and clients are responsible for following the rules of the platforms they post on and the laws
            that apply to paid posts, including disclosing paid partnerships where required.
          </li>
        </ul>

        <h2>Beta</h2>
        <p>
          pipp is provided as is while in beta. Features may change, and we may suspend accounts that misuse the
          service.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
        </p>
      </article>
    </main>
  );
}
