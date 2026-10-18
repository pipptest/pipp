'use client';

import { useMemo, useState } from 'react';

// Pick files from the label's asset library to add to a campaign, in the order clicked.
export default function LibraryPicker({ library, alreadyPaths, onAdd, onCancel }) {
  const [folder, setFolder] = useState('all');
  const [order, setOrder] = useState([]); // asset ids in the order picked
  const taken = new Set(alreadyPaths);

  const shown = useMemo(() => library.assets.filter((a) => {
    if (folder === 'unsorted') return !a.folderId;
    if (folder !== 'all') return a.folderId === folder;
    return true;
  }), [library.assets, folder]);

  function toggle(id) {
    setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }

  if (library.assets.length === 0) {
    return (
      <div className="picker">
        <p>Your assets are empty. Upload files here or on the <a href="/c/assets">Assets</a> tab and they'll be saved for next time.</p>
        <button type="button" className="link-button" onClick={onCancel}>Close</button>
      </div>
    );
  }

  return (
    <div className="picker" role="region" aria-label="Your assets">
      <div className="folder-bar">
        {[['all', 'All files'], ['unsorted', 'Unsorted'], ...library.folders.map((f) => [f.id, f.name])].map(([key, label]) => (
          <button key={key} type="button" className={`pill ${folder === key ? 'is-on' : ''}`} aria-pressed={folder === key} onClick={() => setFolder(key)}>
            {label}
          </button>
        ))}
      </div>
      <ul className="asset-grid asset-grid-small">
        {shown.map((a) => {
          const pos = order.indexOf(a.id);
          const isTaken = taken.has(a.path);
          return (
            <li key={a.id} className={pos >= 0 ? 'is-on' : ''}>
              <button type="button" className="asset-choose" disabled={isTaken} aria-pressed={pos >= 0} onClick={() => toggle(a.id)}>
                {a.url && a.isImage && <img src={a.url} alt="" loading="lazy" />}
                {a.url && a.isVideo && <video src={a.url} muted preload="metadata" />}
                {!a.url && <span className="asset-box">{a.filename}</span>}
                {pos >= 0 && <span className="slide-n">{pos + 1}</span>}
                <span className="name">{isTaken ? 'Already added' : a.filename}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <button type="button" className="button button-small" disabled={!order.length}
          onClick={() => onAdd(order.map((id) => library.assets.find((a) => a.id === id)).filter(Boolean))}>
          Add {order.length || ''} {order.length === 1 ? 'file' : 'files'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
        <span className="small">Files are added in the order you click them; you can reorder after.</span>
      </div>
    </div>
  );
}
