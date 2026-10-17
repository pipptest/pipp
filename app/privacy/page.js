import { SITE } from '../site';

export const metadata = { title: 'Privacy policy · pipp' };

export default function Privacy() {
  return (
    <main>
      <article className="doc">
        <h1>Privacy policy</h1>
        <p className="date">Last updated {SITE.policyDate}</p>

        <p>
          pipp is a marketplace where labels and artists (clients) commission paid posts from social media
          pages. This policy explains what information pipp collects, how it is used, and how you can have it
          deleted.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>Account details you give us, such as your name, email address and fee per post.</li>
          <li>
            If you connect an Instagram account: your username, account ID, profile information, follower count,
            your recent posts and their captions, and the reach and engagement figures Instagram provides for
            your posts.
          </li>
          <li>Photos, videos and text that clients upload for campaigns.</li>
          <li>Records of campaigns, offers, approvals and payments made through pipp.</li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To draft suggested captions that match how your page usually writes.</li>
          <li>To publish a post to your account, only after you confirm it.</li>
          <li>To confirm that a campaign post went live, so the page can be paid.</li>
          <li>To show clients the results of the posts they paid for, and to show pages their own results.</li>
          <li>To operate, secure and improve pipp.</li>
        </ul>

        <h2>Who we share it with</h2>
        <p>
          We do not sell your information. A client sees a page's public profile details, fee and the results of
          posts made for that client's campaigns. We use service providers to run pipp, including hosting, a
          database and file storage, and an AI model provider that processes captions and briefs to draft
          suggested captions. These providers process data only on our behalf.
        </p>

        <h2>How long we keep it</h2>
        <p>
          We keep your information while your account is active. If you disconnect an account or ask us to
          delete your data, we delete the data we obtained from that account within 30 days, except records we
          must keep for legal, tax or payment reasons.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>You can disconnect your Instagram account from pipp at any time.</li>
          <li>
            You can remove pipp's access from Instagram's settings, under apps and websites.
          </li>
          <li>
            You can ask us to access, correct or delete your information. See{' '}
            <a href="/data-deletion">how to delete your data</a>.
          </li>
        </ul>

        <h2>Contact</h2>
        <p>
          Questions about this policy: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
        </p>
      </article>
    </main>
  );
}
