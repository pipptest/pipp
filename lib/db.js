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
  `alter table campaign_assets add column if not exists sort_order integer not null default 0`,
  `alter table offers add column if not exists post_kind text`,
  `alter table offers add column if not exists asset_ids jsonb`,
  `alter table offers add column if not exists carousel_items jsonb`,
  `create table if not exists library_folders (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists library_assets (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id) on delete cascade,
    folder_id uuid references library_folders(id) on delete set null,
    path text not null unique,
    filename text not null,
    content_type text not null,
    size_bytes bigint,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists library_assets_client_idx on library_assets (client_id, folder_id)`,
  `alter table library_folders enable row level security`,
  `alter table library_assets enable row level security`,
  `create table if not exists app_settings (key text primary key, value text, updated_at timestamptz not null default now())`,
  `alter table app_settings enable row level security`,
  `do $$ begin
    if not exists (select 1 from app_settings where key = 'library_backfill') then
      insert into library_assets (client_id, path, filename, content_type, size_bytes, created_at)
        select c.client_id, a.path, a.filename, a.content_type, a.size_bytes, a.created_at
        from campaign_assets a join campaigns c on c.id = a.campaign_id
        on conflict (path) do nothing;
      insert into app_settings (key, value) values ('library_backfill', 'done');
    end if;
  end $$`,
  `alter table instagram_accounts enable row level security`,
  `alter table clients enable row level security`,
  `alter table campaigns enable row level security`,
  `alter table campaign_assets enable row level security`,
  `alter table offers enable row level security`,
  // X and TikTok. instagram_accounts now holds every linked social account; its
  // ig_user_id column is the account key: the Instagram user id as before, or
  // 'x:<id>' / 'tt:<open_id>'. Accounts with the same owner_id belong to one page.
  `alter table instagram_accounts add column if not exists platform text not null default 'instagram'`,
  `alter table instagram_accounts add column if not exists owner_id uuid`,
  `alter table instagram_accounts alter column owner_id set default gen_random_uuid()`,
  `update instagram_accounts set owner_id = id where owner_id is null`,
  `alter table instagram_accounts add column if not exists refresh_token_enc text`,
  `alter table instagram_accounts add column if not exists display_name text`,
  `create index if not exists instagram_accounts_owner_idx on instagram_accounts (owner_id)`,
  `alter table offers add column if not exists checked_at timestamptz`,
  `alter table offers add column if not exists post_options jsonb`,
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
