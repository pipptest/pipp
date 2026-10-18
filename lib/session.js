import { cookies } from 'next/headers';
import { db } from './db';
import { unsign } from './crypto';
import { refreshIfNeeded } from './tokens';

// Returns the connected Instagram account for this browser, or null.
// Also renews the page's Instagram access when it is due, as a backup to the daily job.
export async function currentAccount() {
  const igUserId = unsign((await cookies()).get('pipp_session')?.value);
  if (!igUserId) return null;
  const sql = await db();
  const [account] = await sql`select * from instagram_accounts where ig_user_id = ${igUserId}`;
  if (!account) return null;
  try {
    return await refreshIfNeeded(account);
  } catch (err) {
    console.error('Token refresh on visit failed:', err.message);
    return account;
  }
}
