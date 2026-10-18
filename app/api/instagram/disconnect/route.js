import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { unsign } from '../../../../lib/crypto';
import { siteOrigin } from '../../../../lib/instagram';

export const dynamic = 'force-dynamic';

// Removes the connected account and everything stored from it.
export async function POST(request) {
  const igUserId = unsign(request.cookies.get('pipp_session')?.value);
  if (igUserId) {
    const sql = await db();
    await sql`delete from instagram_accounts where ig_user_id = ${igUserId}`;
  }
  const res = NextResponse.redirect(siteOrigin(request) + '/connect?disconnected=1', 303);
  res.cookies.delete('pipp_session');
  return res;
}
