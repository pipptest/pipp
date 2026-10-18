import { createHash } from 'node:crypto';
import { db } from './db';
import { siteUrl } from './email';

// Sets up a job inside Supabase (pg_cron + pg_net) that calls pipp's /api/cron/tick
// every 5 minutes. Vercel's free plan only allows daily jobs, so this is what makes
// scheduled posts and offer deadlines run on time. Safe to call repeatedly.
export async function ensureScheduler() {
  const sql = await db();
  const url = `${siteUrl()}/api/cron/tick`;
  const secret = process.env.CRON_SECRET || '';
  const fingerprint = createHash('sha256').update(url + '|' + secret).digest('hex').slice(0, 16);
  const [current] = await sql`select value from app_settings where key = 'scheduler'`;
  if (current?.value === fingerprint) return { ok: true, changed: false };

  await sql.unsafe('create extension if not exists pg_cron');
  await sql.unsafe('create extension if not exists pg_net');
  const headers = JSON.stringify(secret ? { Authorization: `Bearer ${secret}` } : {});
  const command = `select net.http_get(url := ${quote(url)}, headers := ${quote(headers)}::jsonb, timeout_milliseconds := 55000)`;
  await sql`select cron.schedule('pipp-tick', '*/5 * * * *', ${command})`;
  await sql`
    insert into app_settings (key, value) values ('scheduler', ${fingerprint})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return { ok: true, changed: true };
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
