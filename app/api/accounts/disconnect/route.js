import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { sign, unsign } from '../../../../lib/crypto';
import { siteOrigin } from '../../../../lib/instagram';
import { revokeAccess } from '../../../../lib/platforms';

export const dynamic = 'force-dynamic';

// Disconnects one linked account (form field "account"), or every account on
// the page ("all"), deleting what pipp stored from it.
export async function POST(request) {
  const sessionKey = unsign(request.cookies.get('pipp_session')?.value);
  const origin = siteOrigin(request);
  if (!sessionKey) return NextResponse.redirect(origin + '/connect', 303);

  const form = await request.formData().catch(() => null);
  const which = String(form?.get('account') || 'all');
  const sql = await db();
  const [me] = await sql`select * from instagram_accounts where ig_user_id = ${sessionKey}`;
  const linked = me ? await sql`select * from instagram_accounts where owner_id = ${me.owner_id} or id = ${me.id}` : [];
  const remove = which === 'all' ? linked : linked.filter((a) => a.ig_user_id === which);

  for (const a of remove) {
    await revokeAccess(a);
    await sql`delete from instagram_accounts where id = ${a.id}`;
  }

  const left = linked.filter((a) => !remove.some((r) => r.id === a.id));
  if (!left.length) {
    const res = NextResponse.redirect(origin + '/connect?disconnected=1', 303);
    res.cookies.delete('pipp_session');
    return res;
  }
  const res = NextResponse.redirect(origin + '/account?unlinked=1', 303);
  if (!left.some((a) => a.ig_user_id === sessionKey)) {
    res.cookies.set('pipp_session', sign(left[0].ig_user_id), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  }
  return res;
}
