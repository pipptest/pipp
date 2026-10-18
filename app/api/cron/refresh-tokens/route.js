import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { decrypt } from '../../../../lib/crypto';
import { getProfile, getRecentMedia } from '../../../../lib/instagram';
import { ensureScheduler } from '../../../../lib/scheduler';
import { saveSnapshot } from '../../../../lib/snapshot';
import { runTick } from '../../../../lib/tick';
import { refreshAllDue } from '../../../../lib/tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily job (see vercel.json): renews Instagram access, refreshes page stats for
// clients, makes sure the 5-minute scheduler exists, and runs one scheduler pass.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  const out = {};
  try { out.tokens = await refreshAllDue(); } catch (err) { out.tokens = err.message; }
  try {
    const sql = await db();
    const accounts = await sql`select * from instagram_accounts where token_expires_at is null or token_expires_at > now()`;
    let updated = 0;
    for (const a of accounts) {
      try {
        const token = decrypt(a.access_token_enc);
        const [profile, media] = await Promise.all([getProfile(token), getRecentMedia(token, 12)]);
        await sql`update instagram_accounts set followers_count = ${profile.followers_count ?? null}, media_count = ${profile.media_count ?? null} where ig_user_id = ${a.ig_user_id}`;
        await saveSnapshot(a.ig_user_id, media, profile.followers_count);
        updated += 1;
      } catch (err) {
        console.error(`Stats refresh failed for @${a.username}:`, err.message);
      }
    }
    out.stats = updated;
  } catch (err) { out.stats = err.message; }
  try { out.scheduler = await ensureScheduler(); } catch (err) { out.scheduler = err.message; }
  try { out.tick = await runTick(); } catch (err) { out.tick = err.message; }
  return NextResponse.json(out);
}
