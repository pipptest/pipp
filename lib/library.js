import { db } from './db';
import { signedViews } from './storage';

const IMAGE = /^image\//;

// Everything in a label's library, newest first, with temporary view links.
export async function loadLibrary(clientId) {
  const sql = await db();
  const folders = await sql`
    select f.id, f.name, count(a.id)::int as count
    from library_folders f left join library_assets a on a.folder_id = f.id
    where f.client_id = ${clientId}
    group by f.id order by lower(f.name)
  `;
  const rows = await sql`
    select a.*, (select count(*)::int from campaign_assets ca where ca.path = a.path) as used
    from library_assets a where a.client_id = ${clientId} order by a.created_at desc
  `;
  const views = await signedViews(rows.map((r) => r.path)).catch(() => ({}));
  const assets = rows.map((r) => ({
    id: r.id,
    folderId: r.folder_id,
    path: r.path,
    filename: r.filename,
    contentType: r.content_type,
    size: r.size_bytes == null ? null : Number(r.size_bytes),
    isImage: IMAGE.test(r.content_type),
    isVideo: r.content_type.startsWith('video/'),
    used: r.used,
    url: views[r.path] || null,
    createdAt: r.created_at.toISOString(),
  }));
  return { folders, assets };
}
