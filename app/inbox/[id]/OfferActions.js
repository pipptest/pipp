'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptAndPublish, acceptSelf, cancelSchedule, declineOffer, newDraft, requestApproval } from '../actions';

function normalise(t) {
  return String(t || '').replace(/#ad\b/gi, '').toLowerCase().replace(/[^a-z0-9@#]+/g, ' ').trim();
}

function localInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function OfferActions({
  offerId, status, draft, initialCaption, approved, approvedCaption, approveEdits, scheduledFor, files, username, clientName,
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(initialCaption);
  const [fileId, setFileId] = useState(files[0]?.id || null);
  const canCarousel = files.length >= 2;
  const [kind, setKind] = useState(canCarousel ? 'carousel' : 'single');
  const [mode, setMode] = useState('choose'); // choose | confirm
  const [when, setWhen] = useState('now');
  const [at, setAt] = useState(() => localInputValue(Date.now() + 60 * 60 * 1000));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);

  const needsApproval = useMemo(() => {
    if (!approveEdits) return false;
    if (approved && normalise(approvedCaption) === normalise(caption)) return false;
    return normalise(draft) !== normalise(caption);
  }, [approveEdits, approved, approvedCaption, draft, caption]);

  const chosen = files.find((f) => f.id === fileId);

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    const result = await fn().catch(() => ({ error: 'Something went wrong. Try again.' }));
    setBusy(null);
    if (result?.error) setError(result.error);
    return result;
  }

  if (status === 'scheduled') {
    const local = new Date(scheduledFor).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return (
      <section className="card">
        <h2>Scheduled for {local}</h2>
        <p>pipp posts it to @{username} automatically, within about 5 minutes of that time.</p>
        <p className="pre caption-box">{initialCaption}</p>
        <button
          type="button"
          className="button button-small"
          disabled={!!busy}
          onClick={async () => { const r = await run('cancel', () => cancelSchedule(offerId)); if (r?.ok) router.refresh(); }}
        >
          {busy === 'cancel' ? 'Cancelling…' : 'Change time or caption'}
        </button>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="offer-actions">
      <div className="row row-between">
        <label htmlFor="caption"><strong>{approved ? 'Approved caption' : 'Suggested caption'}</strong></label>
        {status === 'sent' && (
          <button
            type="button"
            className="button button-small"
            disabled={!!busy}
            onClick={async () => { const r = await run('draft', () => newDraft(offerId)); if (r?.draft) setCaption(r.draft); }}
          >
            {busy === 'draft' ? 'Drafting…' : 'Try another'}
          </button>
        )}
      </div>
      <textarea id="caption" className="caption-input" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
      <span className="small">
        {approved ? `${clientName} approved this wording. Changing it sends it back for approval.` : "Drafted from your recent posts and the client's brief. Edit anything."}
      </span>
      {!/#ad\b/i.test(caption) && (
        <div className="tip">
          <span><strong>Suggestion:</strong> this is a paid post, so it's usually best to say so.</span>
          <button type="button" className="link-button" onClick={() => setCaption((c) => `${c.trim()} #ad`)}>Add #ad</button>
        </div>
      )}

      {needsApproval ? (
        <div className="choices">
          <button
            type="button"
            className="button"
            disabled={!!busy || !caption.trim()}
            onClick={async () => { const r = await run('review', () => requestApproval(offerId, caption)); if (r?.ok) router.refresh(); }}
          >
            {busy === 'review' ? 'Sending…' : `Send to ${clientName} for approval`}
          </button>
          <span className="small">You changed the wording, so {clientName} approves it before you post. Unchanged drafts skip this step.</span>
        </div>
      ) : mode === 'choose' ? (
        <div className="choices">
          <button type="button" className="button" disabled={!!busy || files.length === 0 || !caption.trim()} onClick={() => setMode('confirm')}>
            Post from pipp
          </button>
          <button
            type="button"
            className="button button-small"
            disabled={!!busy || !caption.trim()}
            onClick={async () => { const r = await run('self', () => acceptSelf(offerId, caption)); if (r?.ok) router.refresh(); }}
          >
            {busy === 'self' ? 'Saving…' : 'Accept and post it myself'}
          </button>
          <button
            type="button"
            className="button button-small"
            disabled={!caption.trim()}
            onClick={async () => {
              try { await navigator.clipboard.writeText(caption); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
            }}
          >
            {copied ? 'Caption copied' : 'Copy caption'}
          </button>
          <button
            type="button"
            className="link-button"
            disabled={!!busy}
            onClick={async () => { const r = await run('decline', () => declineOffer(offerId)); if (r?.ok) router.refresh(); }}
          >
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
        </div>
      ) : (
        <div className="review">
          <h2>Post this to @{username}?</h2>
          {canCarousel && (
            <fieldset className="when">
              <legend>Post as</legend>
              <label><input type="radio" name="kind" checked={kind === 'carousel'} onChange={() => setKind('carousel')} /> Carousel of all {Math.min(files.length, 10)} files, in order</label>
              <label><input type="radio" name="kind" checked={kind === 'single'} onChange={() => setKind('single')} /> One file</label>
            </fieldset>
          )}
          {kind === 'carousel' ? (
            <>
              <ol className="slides">
                {files.slice(0, 10).map((f) => (
                  <li key={f.id}>
                    <span className="slide-n">{f.n}</span>
                    {f.url ? (f.isVideo ? <video src={f.url} muted preload="metadata" /> : <img src={f.url} alt={f.filename} />) : <span>{f.filename}</span>}
                  </li>
                ))}
              </ol>
              <p className="small">Slides post in this order. Photos are cropped to match the first photo's shape, as Instagram requires.{files.length > 10 ? ' Instagram allows 10 slides, so only the first 10 are used.' : ''}</p>
            </>
          ) : (
            <>
              {files.length > 1 && (
                <div className="row" role="radiogroup" aria-label="File to post">
                  {files.map((f) => (
                    <label key={f.id} className={`photo-pick ${fileId === f.id ? 'is-on' : ''}`}>
                      <input type="radio" name="file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                      {f.url ? (f.isVideo ? <video src={f.url} muted preload="metadata" /> : <img src={f.url} alt={f.filename} />) : f.filename}
                    </label>
                  ))}
                </div>
              )}
              {files.length === 1 && chosen?.url && (chosen.isVideo
                ? <video className="review-img" src={chosen.url} controls preload="metadata" />
                : <img className="review-img" src={chosen.url} alt={chosen.filename} />)}
              {chosen?.isVideo && <p className="small">Videos post as Reels and also appear on your grid.</p>}
            </>
          )}
          <p className="review-caption">{caption}</p>

          <fieldset className="when">
            <legend>When</legend>
            <label><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /> Post now</label>
            <label><input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')} /> Schedule</label>
            {when === 'later' && (
              <input type="datetime-local" aria-label="Date and time to post" value={at} onChange={(e) => setAt(e.target.value)} />
            )}
          </fieldset>

          <div className="row">
            <button
              type="button"
              className="button"
              disabled={!!busy || (kind === 'single' && !fileId)}
              onClick={async () => {
                const iso = when === 'later' ? new Date(at).toISOString() : null;
                const selection = kind === 'carousel' ? { kind: 'carousel' } : { kind: 'single', assetId: fileId };
                const r = await run('publish', () => acceptAndPublish(offerId, selection, caption, iso));
                if (r?.processing) setNotice('Instagram is still processing. pipp finishes posting in the background and emails you when it’s live.');
                if (r?.ok) router.refresh();
              }}
            >
              {busy === 'publish' ? (when === 'later' ? 'Scheduling…' : 'Publishing…') : when === 'later' ? 'Confirm schedule' : 'Confirm and publish'}
            </button>
            <button type="button" className="button button-small" disabled={!!busy} onClick={() => setMode('choose')}>Back</button>
          </div>
          <p className="small">
            {when === 'later'
              ? 'pipp posts it automatically within about 5 minutes of the time you pick, in your own time zone.'
              : 'This posts publicly to your Instagram straight away. Photos outside 4:5 to 1.91:1 are cropped to fit.'}
          </p>
        </div>
      )}

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </section>
  );
}
