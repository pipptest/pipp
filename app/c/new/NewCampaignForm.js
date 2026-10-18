'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign, prepareAssetUpload } from '../actions';

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
const MAX_MB = 50;

function dollars(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function NewCampaignForm({ pages }) {
  const router = useRouter();
  const [assets, setAssets] = useState([]); // { filename, contentType, size, path, status }
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const uploading = assets.some((a) => a.status === 'uploading');
  const chosen = pages.filter((p) => selected[p.id]);
  const total = chosen.reduce((sum, p) => sum + p.feeCents, 0);

  async function addFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setError(null);
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`${file.name} is over ${MAX_MB} MB.`);
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}`;
      setAssets((list) => [...list, { key, filename: file.name, contentType: file.type, size: file.size, status: 'uploading' }]);
      try {
        const prep = await prepareAssetUpload(file.type);
        if (prep.error) throw new Error(prep.error);
        const put = await fetch(prep.url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
        if (!put.ok) throw new Error(`Uploading ${file.name} failed.`);
        setAssets((list) => list.map((a) => (a.key === key ? { ...a, path: prep.path, status: 'done' } : a)));
      } catch (err) {
        setError(err.message);
        setAssets((list) => list.filter((a) => a.key !== key));
      }
    }
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
      assets: assets.filter((a) => a.status === 'done').map(({ path, filename, contentType, size }) => ({ path, filename, contentType, size })),
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

      <label htmlFor="files">Photos and videos</label>
      <input id="files" type="file" accept={ACCEPT} multiple onChange={addFiles} />
      <span className="small">Pages get the original files. Pages can post photos and videos straight from pipp (videos as Reels), or download them.</span>
      {assets.length > 0 && (
        <ul className="files">
          {assets.map((a) => (
            <li key={a.key}>
              <span>{a.filename}</span>
              <span className="muted">{a.status === 'uploading' ? 'Uploading…' : 'Ready'}</span>
              {a.status === 'done' && (
                <button type="button" className="link-button" onClick={() => setAssets((l) => l.filter((x) => x.key !== a.key))}>
                  Remove
                </button>
              )}
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
