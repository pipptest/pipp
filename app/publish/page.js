import { redirect } from 'next/navigation';
import { currentPage } from '../../lib/session';
import PublishForm from './PublishForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Publish a post · pipp' };

export default async function Publish({ searchParams }) {
  const page = await currentPage();
  if (!page) redirect('/connect');
  const account = page.accounts.find((a) => a.platform === 'instagram');
  if (!account) redirect('/account?need=instagram');
  const params = await searchParams;
  const caption = typeof params?.caption === 'string' ? params.caption.slice(0, 2200) : '';

  return (
    <main>
      <article className="doc">
        <p className="tag">@{account.username}</p>
        <h1>Publish a post</h1>
        <p className="date">One photo with a caption, posted to your feed after you confirm.</p>
        <PublishForm username={account.username} initialCaption={caption} />
      </article>
    </main>
  );
}
