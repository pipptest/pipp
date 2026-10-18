import postgres from 'postgres';

// One shared connection pool per server instance. Supabase's pooled URL runs in
// transaction mode, which does not support prepared statements.
const globalForDb = globalThis;

function client() {
  if (!globalForDb.__pippSql) {
    const url = process.env.SUPABASE_POSTGRES_URL;
    if (!url) throw new Error('SUPABASE_POSTGRES_URL is not set');
    globalForDb.__pippSql = postgres(url, { ssl: 'require', prepare: false, max: 3 });
  }
  return globalForDb.__pippSql;
}

let schemaReady;

// Creates the tables pipp needs if they do not exist yet. Safe to call on every request.
export async function db() {
  const sql = client();
  if (!schemaReady) {
    schemaReady = sql`
      create table if not exists instagram_accounts (
        id uuid primary key default gen_random_uuid(),
        ig_user_id text not null unique,
        username text not null,
        account_type text,
        followers_count integer,
        media_count integer,
        profile_picture_url text,
        access_token_enc text not null,
        token_expires_at timestamptz,
        connected_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.then(() => sql`alter table instagram_accounts enable row level security`)
      .catch((err) => {
        schemaReady = undefined;
        throw err;
      });
  }
  await schemaReady;
  return sql;
}
