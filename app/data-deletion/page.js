import { SITE } from '../site';

export const metadata = { title: 'Delete your data · pipp' };

export default function DataDeletion() {
  return (
    <main>
      <article className="doc">
        <h1>Delete your data</h1>
        <p className="date">Last updated {SITE.policyDate}</p>

        <p>You can have pipp delete the data it holds about you and your connected accounts at any time.</p>

        <h2>To delete your data</h2>
        <ol>
          <li>
            Email <a href={`mailto:${SITE.contactEmail}?subject=Delete%20my%20data`}>{SITE.contactEmail}</a> with
            the subject "Delete my data".
          </li>
          <li>Include the username of each account you connected (Instagram, X or TikTok).</li>
          <li>We confirm by email and delete the data within 30 days.</li>
        </ol>

        <h2>Removing pipp's access</h2>
        <p>
          You can also remove pipp in each platform's settings (Instagram: apps and websites; X: connected apps; TikTok: security and permissions). This stops pipp reading
          from or posting to your account. To have the data already collected deleted, send the email above.
        </p>

        <h2>What we keep</h2>
        <p>
          We may keep records of completed payments where the law requires it. Everything else obtained from
          your account is deleted.
        </p>
      </article>
    </main>
  );
}
