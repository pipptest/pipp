import { cookies } from 'next/headers';
import { db } from './db';
import { unsign } from './crypto';
import { sortAccounts } from './platforms';
import { refreshIfNeeded } from './tokens';

async function renewed(account) {
  try {
    return await refreshIfNeeded(account);
  } catch (err) {
    console.error('Token refresh on visit failed:', err.message);
    return account;
  }
}

// The account this browser signed in with, or null.
// Also renews Instagram access when it is due, as a backup to the daily job.
export async function currentAccount() {
  const key = unsign((await cookies()).get('pipp_session')?.value);
  if (!key) return null;
  const sql = await db();
  const [account] = await sql`select * from instagram_accounts where ig_user_id = ${key}`;
  return account ? renewed(account) : null;
}

// The signed-in page: the account used to sign in plus every account linked to it
// (Instagram, X, TikTok), or null.
export async function currentPage() {
  const account = await currentAccount();
  if (!account) return null;
  const sql = await db();
  const rows = await sql`select * from instagram_accounts where owner_id = ${account.owner_id} or id = ${account.id}`;
  const accounts = sortAccounts(await Promise.all(rows.map((r) => (r.id === account.id ? account : renewed(r)))));
  return { account, accounts, keys: accounts.map((a) => a.ig_user_id) };
}
