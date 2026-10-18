import { NextResponse } from 'next/server';
import { runTick } from '../../../../lib/tick';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Called every 5 minutes by the job in Supabase (see lib/scheduler.js).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runTick());
  } catch (err) {
    console.error('Tick failed:', err.message);
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 });
  }
}
