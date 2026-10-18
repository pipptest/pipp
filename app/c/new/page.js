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
    select a.ig_user_id, a.username, a.followers_count, a.fee_cents, a.snapshot,
      (select count(*)::int from offers o where o.ig_user_id = a.ig_user_id and o.status = 'posted') as done
    from instagram_accounts a where a.fee_cents is not null
    order by a.followers_count desc nulls last
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
            engagementRate: p.snapshot?.engagement_rate ?? null,
            avgLikes: p.snapshot?.avg_likes ?? null,
            campaignsDone: p.done,
          }))}
        />
      </article>
    </main>
  );
}
