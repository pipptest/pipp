import { redirect } from 'next/navigation';
import { platformLabel, platformOf } from '../../lib/platforms';
import { currentPage } from '../../lib/session';
import DraftForm from './DraftForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Draft a caption · pipp' };

export default async function Draft() {
  const page = await currentPage();
  if (!page) redirect('/connect');
  const accounts = page.accounts.map((a) => ({ key: a.ig_user_id, username: a.username, platform: platformOf(a), label: platformLabel(a) }));

  return (
    <main>
      <article className="doc">
        <p className="tag">@{page.account.username}</p>
        <h1>Draft a caption</h1>
        <p className="date">pipp reads your recent posts and writes three options in your voice.</p>
        <DraftForm accounts={accounts} />
        <p className="small"><a href="/account">Back to your page</a></p>
      </article>
    </main>
  );
}
