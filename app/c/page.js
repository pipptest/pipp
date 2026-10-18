import { redirect } from 'next/navigation';
import { currentClient } from '../../lib/clientAuth';
import { db } from '../../lib/db';
import { dollars } from '../../lib/money';
import { logOut } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaigns · pipp' };

export default async function Campaigns() {
  const client = await currentClient();
  if (!client) redirect('/c/login');

  const sql = await db();
  const campaigns = await sql`
    select c.id, c.name, c.created_at,
      count(o.id)::int as pages,
      count(o.id) filter (where o.status = 'posted')::int as posted,
      count(o.id) filter (where o.status = 'accepted')::int as accepted,
      count(o.id) filter (where o.status = 'sent')::int as waiting,
      count(o.id) filter (where o.status = 'declined')::int as declined,
      coalesce(sum(o.fee_cents) filter (where o.status in ('accepted', 'posted')), 0)::int as committed
    from campaigns c left join offers o on o.campaign_id = c.id
    where c.client_id = ${client.id}
    group by c.id order by c.created_at desc
  `;

  return (
    <main>
      <div className="page-head">
        <div>
          <p className="tag">{client.name}</p>
          <h1 className="title">Campaigns</h1>
        </div>
        <div className="row">
          <a className="button" href="/c/new">New campaign</a>
          <form action={logOut}><button className="button button-small" type="submit">Log out</button></form>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <section className="card"><p>No campaigns yet. Start one to send a paid post to pages on pipp.</p></section>
      ) : (
        <ul className="list">
          {campaigns.map((c) => (
            <li key={c.id}>
              <a className="list-row" href={`/c/${c.id}`}>
                <span>
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {[c.posted && `${c.posted} posted`, c.accepted && `${c.accepted} accepted`, c.waiting && `${c.waiting} awaiting reply`, c.declined && `${c.declined} declined`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="right"><span className="muted">Committed</span><strong>{dollars(c.committed)}</strong></span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
