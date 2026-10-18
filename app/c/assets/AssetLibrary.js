'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFolder, deleteAssets, deleteFolder, moveAssets, renameFolder } from '../actions';
import { ACCEPT, MAX_MB, useUploads } from '../useUploads';

const ALL = 'all';
const UNSORTED = 'unsorted';

function size(bytes) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function AssetLibrary({ folders, assets }) {
  const router = useRouter();
  const [view, setView] = useState(ALL);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null);

  const folderForUploads = view !== ALL && view !== UNSORTED ? view : null;
  const uploads = useUploads({ folderId: folderForUploads, onSaved: () => router.refresh() });

  const unsortedCount = assets.filter((a) => !a.folderId).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (view === UNSORTED && a.folderId) return false;
      if (view !== ALL && view !== UNSORTED && a.folderId !== view) return false;
      return !q || a.filename.toLowerCase().includes(q);
    });
  }, [assets, view, query]);
  const pickedIds = Object.keys(picked).filter((id) => picked[id]);
  const current = folders.find((f) => f.id === view);

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    const r = await fn().catch(() => ({ error: 'Something went wrong. Try again.' }));
    setBusy(null);
    if (r?.error) setError(r.error);
    else router.refresh();
    return r;
  }

  const tab = (key, label, count) => (
    <button key={key} type="button" className={`pill ${view === key ? 'is-on' : ''}`} aria-pressed={view === key}
      onClick={() => { setView(key); setPicked({}); }}>
      {label} <span className="count">{count}</span>
    </button>
  );

  return (
    <div className="library">
      <div className="folder-bar">
        {tab(ALL, 'All files', assets.length)}
        {tab(UNSORTED, 'Unsorted', unsortedCount)}
        {folders.map((f) => tab(f.id, f.name, f.count))}
        <form className="row" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run('folder', () => createFolder(newName));
          if (r?.ok) { setNewName(''); setView(r.id); }
        }}>
          <label htmlFor="new-folder" className="visually-hidden">New folder name</label>
          <input id="new-folder" className="inline-input" placeholder="New folder name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} />
          <button type="submit" className="button button-small" disabled={!newName.trim() || !!busy}>Add folder</button>
        </form>
      </div>

      {current && (
        <div className="row folder-tools">
          {renaming === current.id ? (
            <form className="row" onSubmit={async (e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get('name');
              const r = await run('rename', () => renameFolder(current.id, name));
              if (r?.ok) setRenaming(null);
            }}>
              <label htmlFor="rename" className="visually-hidden">Folder name</label>
              <input id="rename" name="name" className="inline-input" defaultValue={current.name} maxLength={80} autoFocus />
              <button type="submit" className="button button-small" disabled={!!busy}>Save name</button>
              <button type="button" className="link-button" onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          ) : (
            <>
              <strong>{current.name}</strong>
              <button type="button" className="link-button" onClick={() => setRenaming(current.id)}>Rename</button>
              <button type="button" className="link-button" disabled={!!busy} onClick={async () => {
                if (!window.confirm(`Delete the folder "${current.name}"? Its files move to Unsorted.`)) return;
                const r = await run('delete-folder', () => deleteFolder(current.id));
                if (r?.ok) setView(ALL);
              }}>Delete folder</button>
            </>
          )}
        </div>
      )}

      <div className="row library-actions">
        <label className="button">
          Upload {folderForUploads ? `to ${current?.name}` : 'files'}
          <input type="file" accept={ACCEPT} multiple className="visually-hidden"
            onChange={(e) => { uploads.upload(e.target.files); e.target.value = ''; }} />
        </label>
        <label htmlFor="search" className="visually-hidden">Search files</label>
        <input id="search" type="search" className="inline-input" placeholder="Search by file name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="small">Photos and videos up to {MAX_MB} MB.</span>
      </div>
      {uploads.pending.length > 0 && (
        <p className="notice" role="status">Uploading {uploads.pending.map((p) => p.filename).join(', ')}…</p>
      )}
      {uploads.error && <p className="notice notice-error" role="alert">{uploads.error}</p>}

      {pickedIds.length > 0 && (
        <div className="selection-bar" role="region" aria-label="Selected files">
          <strong>{pickedIds.length} selected</strong>
          <label htmlFor="move-to" className="visually-hidden">Move to folder</label>
          <select id="move-to" defaultValue="" onChange={async (e) => {
            const target = e.target.value;
            e.target.value = '';
            if (!target) return;
            const r = await run('move', () => moveAssets(pickedIds, target === UNSORTED ? null : target));
            if (r?.ok) setPicked({});
          }}>
            <option value="" disabled>Move to…</option>
            <option value={UNSORTED}>Unsorted</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button type="button" className="link-button" disabled={!!busy} onClick={async () => {
            const used = assets.filter((a) => picked[a.id] && a.used > 0).length;
            const msg = used
              ? `Remove ${pickedIds.length} file(s) from your library? ${used} used in campaigns will stay available to those campaigns' pages.`
              : `Delete ${pickedIds.length} file(s)? This can't be undone.`;
            if (!window.confirm(msg)) return;
            const r = await run('delete', () => deleteAssets(pickedIds));
            if (r?.ok) setPicked({});
          }}>Delete</button>
          <button type="button" className="link-button" onClick={() => setPicked({})}>Clear</button>
        </div>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {shown.length === 0 ? (
        <section className="card">
          <p>{assets.length === 0 ? 'No files yet. Upload photos and videos here, or add them while creating a campaign; they’re saved here too.' : 'No files here.'}</p>
        </section>
      ) : (
        <ul className="asset-grid">
          {shown.map((a) => (
            <li key={a.id} className={picked[a.id] ? 'is-on' : ''}>
              <label className="asset-pick">
                <input type="checkbox" checked={!!picked[a.id]} onChange={(e) => setPicked((p) => ({ ...p, [a.id]: e.target.checked }))} />
                <span className="visually-hidden">Select {a.filename}</span>
              </label>
              {a.url && a.isImage && <img src={a.url} alt={a.filename} loading="lazy" />}
              {a.url && a.isVideo && <video src={a.url} muted preload="metadata" controls />}
              {!a.url && <div className="asset-box">{a.filename}</div>}
              <div className="asset-meta">
                <span className="name" title={a.filename}>{a.filename}</span>
                <span className="muted">{[a.isVideo ? 'Video' : 'Photo', size(a.size), a.used ? `in ${a.used} ${a.used === 1 ? 'campaign' : 'campaigns'}` : null].filter(Boolean).join(' · ')}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
