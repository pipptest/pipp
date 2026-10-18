import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

// Server-only Supabase client for file storage. Instagram fetches images from a
// public link, so published images live in a public bucket; uploads go to a private one.
export const UPLOADS = 'pipp-uploads';
export const PUBLIC = 'pipp-media';

let client;
let bucketsReady;

function supabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Supabase storage settings are missing');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

async function ensureBuckets() {
  if (!bucketsReady) {
    bucketsReady = (async () => {
      const s = supabase();
      for (const [name, isPublic] of [[UPLOADS, false], [PUBLIC, true]]) {
        const { error } = await s.storage.createBucket(name, { public: isPublic });
        if (error && !/exist/i.test(error.message)) throw error;
      }
    })().catch((err) => {
      bucketsReady = undefined;
      throw err;
    });
  }
  await bucketsReady;
  return supabase();
}

export function newPath(owner, ext) {
  return `${owner}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
}

export async function signedUpload(path) {
  const s = await ensureBuckets();
  const { data, error } = await s.storage.from(UPLOADS).createSignedUploadUrl(path);
  if (error) throw error;
  return data.signedUrl;
}

export async function download(path) {
  const s = await ensureBuckets();
  const { data, error } = await s.storage.from(UPLOADS).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function putPublic(path, buffer, contentType) {
  const s = await ensureBuckets();
  const { error } = await s.storage.from(PUBLIC).upload(path, buffer, { contentType, upsert: true });
  if (error) throw error;
  return s.storage.from(PUBLIC).getPublicUrl(path).data.publicUrl;
}

export async function remove(bucket, path) {
  const s = await ensureBuckets();
  await s.storage.from(bucket).remove([path]);
}
