'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptAndPublish, acceptSelf, declineOffer, newDraft } from '../actions';

export default function OfferActions({ offerId, initialCaption, photos, username }) {
  const router = useRouter();
  const [caption, setCaption] = useState(initialCaption);
  const [photoId, setPhotoId] = useState(photos[0]?.id || null);
  const [mode, setMode] = useState('choose'); // choose | confirm-app
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    const result = await fn().catch(() => ({ error: 'Something went wrong. Try again.' }));
    setBusy(null);
    if (result?.error) setError(result.error);
    return result;
  }

  async function regenerate() {
    const r = await run('draft', () => newDraft(offerId));
    if (r?.draft) setCaption(r.draft);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="offer-actions">
      <div className="row row-between">
        <label htmlFor="caption"><strong>Suggested caption</strong></label>
        <button type="button" className="button button-small" onClick={regenerate} disabled={!!busy}>
          {busy === 'draft' ? 'Drafting…' : 'Try another'}
        </button>
      </div>
      <textarea id="caption" className="caption-input" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
      <span className="small">Drafted from your recent posts and the client's brief. Edit anything.</span>

      {mode === 'choose' && (
        <div className="choices">
          <button
            type="button"
            className="button"
            disabled={!!busy || photos.length === 0 || !caption.trim()}
            onClick={() => setMode('confirm-app')}
          >
            Post from pipp
          </button>
          <button
            type="button"
            className="button button-small"
            disabled={!!busy || !caption.trim()}
            onClick={async () => {
              const r = await run('self', () => acceptSelf(offerId, caption));
              if (r?.ok) router.refresh();
            }}
          >
            {busy === 'self' ? 'Saving…' : 'Accept and post it myself'}
          </button>
          <button type="button" className="button button-small" onClick={copy} disabled={!caption.trim()}>
            {copied ? 'Caption copied' : 'Copy caption'}
          </button>
          <button
            type="button"
            className="link-button"
            disabled={!!busy}
            onClick={async () => {
              const r = await run('decline', () => declineOffer(offerId));
              if (r?.ok) router.refresh();
            }}
          >
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
          {photos.length === 0 && <p className="small">This campaign has only videos, which you post yourself for now.</p>}
        </div>
      )}

      {mode === 'confirm-app' && (
        <div className="review">
          <h2>Post this to @{username}?</h2>
          {photos.length > 1 && (
            <div className="row">
              {photos.map((p) => (
                <label key={p.id} className={`photo-pick ${photoId === p.id ? 'is-on' : ''}`}>
                  <input type="radio" name="photo" checked={photoId === p.id} onChange={() => setPhotoId(p.id)} />
                  {p.url ? <img src={p.url} alt={p.filename} /> : p.filename}
                </label>
              ))}
            </div>
          )}
          {photos.length === 1 && photos[0].url && <img className="review-img" src={photos[0].url} alt={photos[0].filename} />}
          <p className="review-caption">{caption}</p>
          <div className="row">
            <button
              type="button"
              className="button"
              disabled={!!busy}
              onClick={async () => {
                const r = await run('publish', () => acceptAndPublish(offerId, photoId, caption));
                if (r?.ok) router.refresh();
              }}
            >
              {busy === 'publish' ? 'Publishing…' : 'Confirm and publish'}
            </button>
            <button type="button" className="button button-small" disabled={!!busy} onClick={() => setMode('choose')}>Back</button>
          </div>
          <p className="small">This posts publicly to your Instagram straight away. Photos outside 4:5 to 1.91:1 are cropped to fit.</p>
        </div>
      )}

      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </section>
  );
}
