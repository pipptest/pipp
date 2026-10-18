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

// Each statement is safe to run repeatedly. Add new ones at the end.
const SCHEMA = [
  `create table if not exists instagram_accounts (
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
  )`,
  `alter table instagram_accounts add column if not exists fee_cents integer`,
  `alter table instagram_accounts add column if not exists scopes text`,
  `create table if not exists clients (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    name text not null,
    password_hash text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists campaigns (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id) on delete cascade,
    name text not null,
    brief text not null,
    extras text,
    link text,
    starts_on date,
    ends_on date,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists campaign_assets (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references campaigns(id) on delete cascade,
    path text not null,
    filename text not null,
    content_type text not null,
    size_bytes bigint,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists offers (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references campaigns(id) on delete cascade,
    ig_user_id text not null,
    fee_cents integer not null,
    status text not null default 'sent',
    caption_draft text,
    caption_final text,
    method text,
    accepted_at timestamptz,
    media_id text,
    permalink text,
    posted_at timestamptz,
    stats jsonb,
    stats_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (campaign_id, ig_user_id)
  )`,
  `create index if not exists offers_ig_user_id_idx on offers (ig_user_id)`,
  `alter table instagram_accounts add column if not exists email text`,
  `alter table instagram_accounts add column if not exists snapshot jsonb`,
  `alter table instagram_accounts add column if not exists snapshot_at timestamptz`,
  `alter table campaigns add column if not exists approve_edits boolean not null default true`,
  `alter table campaigns add column if not exists respond_hours integer not null default 48`,
  `alter table offers add column if not exists expires_at timestamptz`,
  `alter table offers add column if not exists scheduled_for timestamptz`,
  `alter table offers add column if not exists asset_id uuid`,
  `alter table offers add column if not exists container_id text`,
  `alter table offers add column if not exists public_path text`,
  `alter table offers add column if not exists approval_note text`,
  `alter table offers add column if not exists publish_error text`,
  `alter table offers add column if not exists caption_approved boolean not null default false`,
  `create index if not exists offers_status_idx on offers (status)`,
  `create table if not exists app_settings (key text primary key, value text, updated_at timestamptz not null default now())`,
  `alter table app_settings enable row level security`,
  `alter table instagram_accounts enable row level security`,
  `alter table clients enable row level security`,
  `alter table campaigns enable row level security`,
  `alter table campaign_assets enable row level security`,
  `alter table offers enable row level security`,
];

let schemaReady;

// Creates or updates the tables pipp needs. Safe to call on every request.
export async function db() {
  const sql = client();
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA) await sql.unsafe(statement);
    })().catch((err) => {
      schemaReady = undefined;
      throw err;
    });
  }
  await schemaReady;
  return sql;
}
