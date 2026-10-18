import { redirect } from 'next/navigation';
import { currentClient } from '../../../lib/clientAuth';
import { db } from '../../../lib/db';
import NewCampaignForm from './NewCampaignForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New campaign · pipp' };

export default async function NewCampaign() {
  const client = await currentClient();
  if (!client) redirect('/c/login');

  const sql = await db();
  const pages = await sql`
    select ig_user_id, username, followers_count, fee_cents, connected_at
    from instagram_accounts where fee_cents is not null
    order by followers_count desc nulls last
  `;

  return (
    <main>
      <article className="doc doc-wide">
        <p className="tag">{client.name}</p>
        <h1>New campaign</h1>
        <p className="date">Each page you pick gets your files, your brief and a caption drafted in its own voice.</p>
        <NewCampaignForm
          pages={pages.map((p) => ({
            id: p.ig_user_id,
            username: p.username,
            followers: p.followers_count,
            feeCents: p.fee_cents,
          }))}
        />
      </article>
    </main>
  );
}
