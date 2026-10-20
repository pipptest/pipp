import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { keepAlive } from '../../../../lib/platforms';
import { ensureScheduler } from '../../../../lib/scheduler';
import { refreshStats } from '../../../../lib/snapshot';
import { runTick } from '../../../../lib/tick';
import { refreshAllDue } from '../../../../lib/tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily job (see vercel.json): renews Instagram, X and TikTok access, refreshes
// page stats for clients, makes sure the 5-minute scheduler exists, and runs one scheduler pass.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  const out = {};
  try { out.tokens = await refreshAllDue(); } catch (err) { out.tokens = err.message; }
  try {
    const sql = await db();
    const accounts = await sql`
      select * from instagram_accounts
      where platform <> 'instagram' or token_expires_at is null or token_expires_at > now()
    `;
    let updated = 0;
    let renewed = 0;
    for (const a of accounts) {
      try {
        if (await keepAlive(a)) renewed += 1;
        const [fresh] = await sql`select * from instagram_accounts where id = ${a.id}`;
        await refreshStats(fresh || a, { force: true });
        updated += 1;
      } catch (err) {
        console.error(`Stats refresh failed for @${a.username} (${a.platform}):`, err.message);
      }
    }
    out.stats = updated;
    out.renewed = renewed;
  } catch (err) { out.stats = err.message; }
  try { out.scheduler = await ensureScheduler(); } catch (err) { out.scheduler = err.message; }
  try { out.tick = await runTick(); } catch (err) { out.tick = err.message; }
  return NextResponse.json(out);
}
