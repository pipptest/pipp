'use server';

import { redirect } from 'next/navigation';
import { currentClient, endClientSession, hashPassword, startClientSession, verifyPassword } from '../../lib/clientAuth';
import { db } from '../../lib/db';
import { notify } from '../../lib/notify';
import { ensureScheduler } from '../../lib/scheduler';
import { UPLOADS, newPath, remove, signedUpload } from '../../lib/storage';
import { revalidatePath } from 'next/cache';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp(_prev, formData) {
  const name = String(formData.get('name') || '').trim().slice(0, 120);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const values = { name, email };
  if (!name) return { values, error: 'Add your name or your label’s name.' };
  if (!EMAIL.test(email)) return { values, error: 'Enter a valid email address.' };
  if (password.length < 10) return { values, error: 'Use a password of at least 10 characters.' };

  const sql = await db();
  const [existing] = await sql`select id from clients where email = ${email}`;
  if (existing) return { values, error: 'There is already an account with that email. Log in instead.' };
  const [client] = await sql`
    insert into clients (email, name, password_hash) values (${email}, ${name}, ${await hashPassword(password)})
    returning id
  `;
  await startClientSession(client.id);
  redirect('/c');
}

export async function logIn(_prev, formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const sql = await db();
  const [client] = await sql`select id, password_hash from clients where email = ${email}`;
  if (!client || !(await verifyPassword(password, client.password_hash))) {
    return { values: { email }, error: 'That email and password do not match.' };
  }
  await startClientSession(client.id);
  redirect('/c');
}

export async function logOut() {
  await endClientSession();
  redirect('/c/login');
}

const TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
};

export async function prepareAssetUpload(contentType) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  const ext = TYPES[contentType];
  if (!ext) return { error: 'Use JPEG, PNG or WebP photos, or MP4 or MOV videos.' };
  try {
    const path = newPath(`clients/${client.id}`, ext);
    return { path, url: await signedUpload(path) };
  } catch (err) {
    console.error('Asset upload setup failed:', err.message);
    return { error: 'Could not start the upload. Try again in a moment.' };
  }
}

function cleanLink(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanDate(value) {
  const v = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function createCampaign(input) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };

  const name = String(input.name || '').trim().slice(0, 120);
  const brief = String(input.brief || '').trim().slice(0, 2000);
  const extras = String(input.extras || '').trim().slice(0, 500) || null;
  const link = cleanLink(input.link);
  const startsOn = cleanDate(input.startsOn);
  const endsOn = cleanDate(input.endsOn);
  const respondHours = [24, 48, 72].includes(Number(input.respondHours)) ? Number(input.respondHours) : 48;
  const approveEdits = input.approveEdits !== false;
  const pageIds = Array.isArray(input.pageIds) ? input.pageIds.map(String).slice(0, 50) : [];
  const assets = Array.isArray(input.assets) ? input.assets.slice(0, 10) : [];
  const prefix = `clients/${client.id}/`;

  if (!name) return { error: 'Give the campaign a name.' };
  if (brief.length < 10) return { error: 'Add a brief of at least a sentence.' };
  if (link === undefined) return { error: 'The link must start with https://.' };
  if (startsOn && endsOn && endsOn < startsOn) return { error: 'The end date is before the start date.' };
  if (!pageIds.length) return { error: 'Choose at least one page.' };
  if (!assets.length) return { error: 'Add at least one photo or video.' };
  if (assets.some((a) => typeof a.path !== 'string' || !a.path.startsWith(prefix) || a.path.includes('..'))) {
    return { error: 'One of the uploads does not belong to this account.' };
  }

  const sql = await db();
  const pages = await sql`
    select ig_user_id, fee_cents from instagram_accounts
    where ig_user_id in ${sql(pageIds)} and fee_cents is not null
  `;
  if (!pages.length) return { error: 'None of the chosen pages are available right now.' };

  const campaignId = await sql.begin(async (tx) => {
    const [campaign] = await tx`
      insert into campaigns (client_id, name, brief, extras, link, starts_on, ends_on, respond_hours, approve_edits)
      values (${client.id}, ${name}, ${brief}, ${extras}, ${link}, ${startsOn}, ${endsOn}, ${respondHours}, ${approveEdits})
      returning id
    `;
    for (const [i, a] of assets.entries()) {
      await tx`
        insert into campaign_assets (campaign_id, path, filename, content_type, size_bytes, sort_order)
        values (${campaign.id}, ${a.path}, ${String(a.filename || 'file').slice(0, 200)},
                ${String(a.contentType || '')}, ${Number(a.size) || null}, ${i})
      `;
    }
    for (const p of pages) {
      await tx`
        insert into offers (campaign_id, ig_user_id, fee_cents, expires_at)
        values (${campaign.id}, ${p.ig_user_id}, ${p.fee_cents}, now() + make_interval(hours => ${respondHours}))
      `;
    }
    return campaign.id;
  });

  const offers = await sql`select id from offers where campaign_id = ${campaignId}`;
  await Promise.all(offers.map((o) => notify('new_offer', o.id)));
  await ensureScheduler().catch((err) => console.error('Scheduler setup failed:', err.message));
  return { ok: true, campaignId };
}

async function clientOffer(offerId) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  if (!/^[0-9a-f-]{36}$/i.test(String(offerId))) return { error: 'Not found.' };
  const sql = await db();
  const [offer] = await sql`
    select o.* from offers o join campaigns c on c.id = o.campaign_id
    where o.id = ${offerId} and c.client_id = ${client.id}
  `;
  return offer ? { offer, sql } : { error: 'Not found.' };
}

export async function approveCaption(offerId) {
  const ctx = await clientOffer(offerId);
  if (ctx.error) return ctx;
  const [updated] = await ctx.sql`
    update offers set status = 'approved', caption_approved = true, approval_note = null,
      expires_at = greatest(coalesce(expires_at, now()), now() + interval '24 hours'), updated_at = now()
    where id = ${offerId} and status = 'review' returning id
  `;
  if (!updated) return { error: 'This caption is no longer waiting for approval.' };
  await notify('caption_approved', offerId);
  return { ok: true };
}

export async function requestChanges(offerId, note) {
  const ctx = await clientOffer(offerId);
  if (ctx.error) return ctx;
  const text = String(note || '').trim().slice(0, 500);
  if (!text) return { error: 'Say what you would like changed.' };
  const [updated] = await ctx.sql`
    update offers set status = 'sent', caption_approved = false, approval_note = ${text},
      expires_at = greatest(coalesce(expires_at, now()), now() + interval '24 hours'), updated_at = now()
    where id = ${offerId} and status = 'review' returning id
  `;
  if (!updated) return { error: 'This caption is no longer waiting for approval.' };
  await notify('changes_requested', offerId);
  return { ok: true };
}


// ---- Asset library ----

const UUID = /^[0-9a-f-]{36}$/i;

async function ownFolder(sql, clientId, folderId) {
  if (!folderId) return null;
  if (!UUID.test(String(folderId))) return undefined;
  const [f] = await sql`select id from library_folders where id = ${folderId} and client_id = ${clientId}`;
  return f ? f.id : undefined;
}

// Saves uploaded files (already in storage) into the library. Returns their library rows.
export async function registerUploads(items, folderId = null) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  const sql = await db();
  const folder = await ownFolder(sql, client.id, folderId);
  if (folder === undefined) return { error: 'That folder no longer exists.' };
  const prefix = `clients/${client.id}/`;
  const list = (Array.isArray(items) ? items : []).slice(0, 50);
  if (list.some((a) => typeof a.path !== 'string' || !a.path.startsWith(prefix) || a.path.includes('..'))) {
    return { error: 'One of the uploads does not belong to this account.' };
  }
  const saved = [];
  for (const a of list) {
    const [row] = await sql`
      insert into library_assets (client_id, folder_id, path, filename, content_type, size_bytes)
      values (${client.id}, ${folder}, ${a.path}, ${String(a.filename || 'file').slice(0, 200)},
              ${String(a.contentType || '')}, ${Number(a.size) || null})
      on conflict (path) do update set folder_id = coalesce(excluded.folder_id, library_assets.folder_id)
      returning id, path
    `;
    saved.push(row);
  }
  revalidatePath('/c/assets');
  return { ok: true, saved };
}

export async function createFolder(name) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  const clean = String(name || '').trim().slice(0, 80);
  if (!clean) return { error: 'Give the folder a name.' };
  const sql = await db();
  const [folder] = await sql`insert into library_folders (client_id, name) values (${client.id}, ${clean}) returning id`;
  revalidatePath('/c/assets');
  return { ok: true, id: folder.id };
}

export async function renameFolder(folderId, name) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  const clean = String(name || '').trim().slice(0, 80);
  if (!clean) return { error: 'Give the folder a name.' };
  if (!UUID.test(String(folderId))) return { error: 'Folder not found.' };
  const sql = await db();
  const [f] = await sql`update library_folders set name = ${clean} where id = ${folderId} and client_id = ${client.id} returning id`;
  if (!f) return { error: 'Folder not found.' };
  revalidatePath('/c/assets');
  return { ok: true };
}

// Deletes a folder; its files move to Unsorted, nothing is lost.
export async function deleteFolder(folderId) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  if (!UUID.test(String(folderId))) return { error: 'Folder not found.' };
  const sql = await db();
  await sql`update library_assets set folder_id = null where folder_id = ${folderId} and client_id = ${client.id}`;
  await sql`delete from library_folders where id = ${folderId} and client_id = ${client.id}`;
  revalidatePath('/c/assets');
  return { ok: true };
}

export async function moveAssets(assetIds, folderId) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  const ids = (Array.isArray(assetIds) ? assetIds : []).filter((id) => UUID.test(String(id))).slice(0, 200);
  if (!ids.length) return { error: 'Choose at least one file.' };
  const sql = await db();
  const folder = await ownFolder(sql, client.id, folderId);
  if (folder === undefined) return { error: 'That folder no longer exists.' };
  await sql`update library_assets set folder_id = ${folder} where id in ${sql(ids)} and client_id = ${client.id}`;
  revalidatePath('/c/assets');
  return { ok: true };
}

// Removes files from the library. A file already used in a campaign stays available
// to that campaign's pages; it's only deleted from storage when nothing uses it.
export async function deleteAssets(assetIds) {
  const client = await currentClient();
  if (!client) return { error: 'Your session has ended. Log in again.' };
  const ids = (Array.isArray(assetIds) ? assetIds : []).filter((id) => UUID.test(String(id))).slice(0, 200);
  if (!ids.length) return { error: 'Choose at least one file.' };
  const sql = await db();
  const rows = await sql`delete from library_assets where id in ${sql(ids)} and client_id = ${client.id} returning path`;
  for (const r of rows) {
    const [{ n }] = await sql`select count(*)::int as n from campaign_assets where path = ${r.path}`;
    if (n === 0) await remove(UPLOADS, r.path).catch(() => {});
  }
  revalidatePath('/c/assets');
  return { ok: true, deleted: rows.length };
}
