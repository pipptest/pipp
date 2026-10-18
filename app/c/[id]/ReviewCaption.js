'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveCaption, requestChanges } from '../actions';

export default function ReviewCaption({ offerId, username, caption }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    const r = await fn().catch(() => ({ error: 'Something went wrong. Try again.' }));
    setBusy(null);
    if (r?.error) setError(r.error);
    if (r?.ok) router.refresh();
  }

  return (
    <div className="review-box">
      <strong>@{username} rewrote your caption. Approve it before it posts.</strong>
      <p className="pre">{caption}</p>
      {asking ? (
        <div className="form">
          <label htmlFor={`note-${offerId}`}>What should change?</label>
          <textarea id={`note-${offerId}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <div className="row">
            <button type="button" className="button" disabled={!!busy || !note.trim()} onClick={() => run('changes', () => requestChanges(offerId, note))}>
              {busy === 'changes' ? 'Sending…' : 'Send to page'}
            </button>
            <button type="button" className="button button-small" disabled={!!busy} onClick={() => setAsking(false)}>Back</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="button" disabled={!!busy} onClick={() => run('approve', () => approveCaption(offerId))}>
            {busy === 'approve' ? 'Approving…' : 'Approve caption'}
          </button>
          <button type="button" className="button button-small" disabled={!!busy} onClick={() => setAsking(true)}>Ask for changes</button>
        </div>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </div>
  );
}
