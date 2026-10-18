'use client';

import { useState } from 'react';
import { prepareAssetUpload, registerUploads } from './actions';

export const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
export const MAX_MB = 50;

// Uploads files straight to storage, then saves them into the label's library.
// onSaved receives { path, filename, contentType, size, id } for each finished file.
export function useUploads({ folderId = null, onSaved } = {}) {
  const [pending, setPending] = useState([]); // { key, filename }
  const [error, setError] = useState(null);

  async function upload(fileList) {
    const files = Array.from(fileList || []);
    setError(null);
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`${file.name} is over ${MAX_MB} MB.`);
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      setPending((p) => [...p, { key, filename: file.name }]);
      try {
        const prep = await prepareAssetUpload(file.type);
        if (prep.error) throw new Error(prep.error);
        const put = await fetch(prep.url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
        if (!put.ok) throw new Error(`Uploading ${file.name} failed.`);
        const item = { path: prep.path, filename: file.name, contentType: file.type, size: file.size };
        const saved = await registerUploads([item], folderId);
        if (saved.error) throw new Error(saved.error);
        onSaved?.({ ...item, id: saved.saved[0]?.id });
      } catch (err) {
        setError(err.message);
      } finally {
        setPending((p) => p.filter((x) => x.key !== key));
      }
    }
  }

  return { upload, pending, uploading: pending.length > 0, error, setError };
}
