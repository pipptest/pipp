import { redirect } from 'next/navigation';
import { currentAccount } from '../../lib/session';
import DraftForm from './DraftForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Draft a caption · pipp' };

export default async function Draft() {
  const account = await currentAccount();
  if (!account) redirect('/connect');

  return (
    <main>
      <article className="doc">
        <p className="tag">@{account.username}</p>
        <h1>Draft a caption</h1>
        <p className="date">pipp reads your recent captions and writes three options in your voice.</p>
        <DraftForm username={account.username} />
        <p className="small"><a href="/account">Back to your page</a></p>
      </article>
    </main>
  );
}
