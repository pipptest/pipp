import { NextResponse } from 'next/server';
import { refreshAllDue } from '../../../../lib/tokens';

export const dynamic = 'force-dynamic';

// Runs daily (see vercel.json). If CRON_SECRET is set in Vercel, only Vercel's
// scheduler, which sends it automatically, can trigger this.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  try {
    return NextResponse.json(await refreshAllDue());
  } catch (err) {
    console.error('Scheduled refresh failed:', err.message);
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
