import { cookies } from 'next/headers';
import { db } from './db';
import { unsign } from './crypto';

// Returns the connected Instagram account for this browser, or null.
export async function currentAccount() {
  const igUserId = unsign((await cookies()).get('pipp_session')?.value);
  if (!igUserId) return null;
  const sql = await db();
  const [account] = await sql`select * from instagram_accounts where ig_user_id = ${igUserId}`;
  return account || null;
}
