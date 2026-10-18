'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign } from '../actions';
import { ACCEPT, MAX_MB, useUploads } from '../useUploads';
import LibraryPicker from './LibraryPicker';

function dollars(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function NewCampaignForm({ pages, library }) {
  const router = useRouter();
  const [assets, setAssets] = useState([]); // { key, filename, contentType, size, path, url }
  const [picking, setPicking] = useState(false);
  const uploads = useUploads({
    onSaved: (item) => setAssets((list) => [...list, { ...item, key: item.path, status: 'done' }]),
  });
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const uploading = uploads.uploading;
  const chosen = pages.filter((p) => selected[p.id]);
  const total = chosen.reduce((sum, p) => sum + p.feeCents, 0);

  function addFromLibrary(items) {
    setAssets((list) => {
      const have = new Set(list.map((a) => a.path));
      return [...list, ...items.filter((i) => !have.has(i.path)).map((i) => ({ ...i, key: i.path, status: 'done' }))];
    });
    setPicking(false);
  }

  function move(key, delta) {
    setAssets((list) => {
      const i = list.findIndex((a) => a.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const result = await createCampaign({
      name: form.get('name'),
      brief: form.get('brief'),
      extras: form.get('extras'),
      link: form.get('link'),
      startsOn: form.get('startsOn'),
      endsOn: form.get('endsOn'),
      respondHours: form.get('respondHours'),
      approveEdits: form.get('approveEdits') === 'on',
      pageIds: chosen.map((p) => p.id),
      assets: assets.map(({ path, filename, contentType, size }) => ({ path, filename, contentType, size })),
    }).catch(() => ({ error: 'Something went wrong. Try again.' }));
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/c/${result.campaignId}?sent=1`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <label htmlFor="name">Campaign name</label>
      <input id="name" name="name" required placeholder="Glass Hours: single launch" />

      <label htmlFor="brief">What should the posts say?</label>
      <textarea id="brief" name="brief" rows={5} required placeholder="Announce Mara Vale's new single 'Glass Hours', out Friday on Northlight Records." />

      <label htmlFor="extras">Tags to include (optional)</label>
      <input id="extras" name="extras" placeholder="@maravale @northlightrecords" />

      <label htmlFor="link">Link to promote (optional)</label>
      <input id="link" name="link" type="url" placeholder="https://" />

      <div className="row row-fields">
        <div>
          <label htmlFor="startsOn">Post no earlier than</label>
          <input id="startsOn" name="startsOn" type="date" />
        </div>
        <div>
          <label htmlFor="endsOn">Post no later than</label>
          <input id="endsOn" name="endsOn" type="date" />
        </div>
      </div>

      <label htmlFor="respondHours">Pages must reply within</label>
      <select id="respondHours" name="respondHours" defaultValue="48">
        <option value="24">24 hours</option>
        <option value="48">48 hours</option>
        <option value="72">72 hours</option>
      </select>
      <label className="check">
        <input type="checkbox" name="approveEdits" defaultChecked />
        <span><strong>Approve edited captions before they post</strong><br /><span className="muted">Drafts go straight through. You only review a caption if a page rewrites it.</span></span>
      </label>

      <span className="field-label">Photos and videos</span>
      <div className="row">
        <button type="button" className="button button-small" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
          Choose from your assets
        </button>
        <label className="button button-small">
          Upload new
          <input type="file" accept={ACCEPT} multiple className="visually-hidden"
            onChange={(e) => { uploads.upload(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      {picking && <LibraryPicker library={library} alreadyPaths={assets.map((a) => a.path)} onAdd={addFromLibrary} onCancel={() => setPicking(false)} />}
      {uploads.pending.length > 0 && <p className="small" role="status">Uploading {uploads.pending.map((p) => p.filename).join(', ')}…</p>}
      {uploads.error && <p className="notice notice-error" role="alert">{uploads.error}</p>}
      <span className="small">New uploads are saved to your assets (Unsorted) so you can reuse them. Up to {MAX_MB} MB each. Pages get the original files. Use the arrows to set the order. With two or more files, pages can post them as a carousel in this order (up to 10), or pick one.</span>
      {assets.length > 0 && (
        <ul className="files">
          {assets.map((a, i) => (
            <li key={a.key}>
              <span className="n">{i + 1}.</span>
              <span>{a.filename}</span>
              <span className="order-buttons">
                <button type="button" aria-label={`Move ${a.filename} earlier`} disabled={i === 0} onClick={() => move(a.key, -1)}>↑</button>
                <button type="button" aria-label={`Move ${a.filename} later`} disabled={i === assets.length - 1} onClick={() => move(a.key, 1)}>↓</button>
              </span>
              <button type="button" className="link-button" onClick={() => setAssets((l) => l.filter((x) => x.key !== a.key))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="pages">
        <legend>Pages</legend>
        {pages.length === 0 ? (
          <p className="muted">No pages are taking campaigns yet. A page appears here once it connects and sets a fee.</p>
        ) : (
          pages.map((p) => (
            <label key={p.id} className="page-option">
              <input
                type="checkbox"
                checked={!!selected[p.id]}
                onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
              />
              <span className="grow"><strong>@{p.username}</strong>
                <span className="muted">
                  {[
                    p.followers != null && `${p.followers.toLocaleString('en-US')} followers`,
                    p.engagementRate != null && `${p.engagementRate}% engagement`,
                    p.avgLikes != null && `~${p.avgLikes.toLocaleString('en-US')} likes per post`,
                    p.campaignsDone ? `${p.campaignsDone} pipp ${p.campaignsDone === 1 ? 'campaign' : 'campaigns'}` : 'New to pipp',
                  ].filter(Boolean).join(' · ')}
                </span>
                <a href={`/c/pages/${p.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>View profile</a>
              </span>
              <strong>{dollars(p.feeCents)}</strong>
            </label>
          ))
        )}
      </fieldset>

      <p className="total">
        {chosen.length} {chosen.length === 1 ? 'page' : 'pages'} · <strong>{dollars(total)}</strong> if all accept and post
      </p>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || uploading}>
        {busy ? 'Sending…' : uploading ? 'Waiting for uploads…' : 'Send to pages'}
      </button>
    </form>
  );
}
