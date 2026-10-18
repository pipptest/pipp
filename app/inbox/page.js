import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { dollars } from '../../lib/money';
import { OPEN_FOR_PAGE, refreshOffer, statusLabel } from '../../lib/offers';
import { currentAccount } from '../../lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign inbox · pipp' };

export default async function Inbox() {
  const account = await currentAccount();
  if (!account) redirect('/connect');

  const sql = await db();
  const rows = await sql`
    select o.*, c.name as campaign_name, c.extras, c.client_id, cl.name as client_name
    from offers o
    join campaigns c on c.id = o.campaign_id
    join clients cl on cl.id = c.client_id
    where o.ig_user_id = ${account.ig_user_id}
    order by (o.status in ('sent', 'approved', 'failed')) desc, o.created_at desc
  `;
  const offers = await Promise.all(
    rows.map(async (r) => ({ ...(await refreshOffer(r, { extras: r.extras }, account)), campaign_name: r.campaign_name, client_name: r.client_name })),
  );
  const pending = offers.filter((o) => o.status === 'posted').reduce((t, o) => t + o.fee_cents, 0);

  return (
    <main>
      <p className="small"><a href="/account">@{account.username}</a></p>
      <div className="page-head">
        <h1 className="title">Campaign inbox</h1>
      </div>
      <div className="stats">
        <div><span>Owed for live posts</span><strong>{dollars(pending)}</strong></div>
        <div><span>Needs your reply</span><strong>{offers.filter((o) => OPEN_FOR_PAGE.includes(o.status)).length}</strong></div>
      </div>
      {account.fee_cents == null && (
        <p className="notice">Set your fee on <a href="/account">your page</a> so clients can send you campaigns.</p>
      )}
      {offers.length === 0 ? (
        <section className="card"><p>No campaigns yet. They will appear here when a client picks your page.</p></section>
      ) : (
        <ul className="list">
          {offers.map((o) => (
            <li key={o.id}>
              <a className="list-row" href={`/inbox/${o.id}`}>
                <span>
                  <strong>{o.campaign_name}</strong>
                  <span className="muted">{o.client_name}</span>
                  <span className={`chip chip-${o.status}`}>{statusLabel(o.status, 'page')}</span>
                </span>
                <span className="right"><strong>{dollars(o.fee_cents)}</strong></span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="small">Payments are handled outside pipp during the beta. You are owed your fee once your post is live.</p>
    </main>
  );
}
