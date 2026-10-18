'use client';

import { useActionState, useState } from 'react';
import { draftAction } from './actions';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button button-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function DraftForm({ username }) {
  const [state, action, pending] = useActionState(draftAction, null);

  return (
    <>
      <form action={action} className="form">
        <label htmlFor="brief">What should the post say?</label>
        <textarea
          id="brief"
          name="brief"
          rows={5}
          required
          defaultValue={state?.values?.brief}
          placeholder="Example: Announce Mara Vale's new single 'Glass Hours', out Friday Oct 23 on Northlight Records."
        />
        <label htmlFor="extras">Tags or link to include (optional)</label>
        <input
          id="extras"
          name="extras"
          type="text"
          defaultValue={state?.values?.extras}
          placeholder="@maravale @northlightrecords"
        />
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Drafting…' : 'Draft captions'}
        </button>
      </form>

      {state?.error && <p className="notice notice-error" role="alert">{state.error}</p>}

      {state?.drafts && (
        <section aria-live="polite">
          <h2>Drafts for @{username}</h2>
          <p className="small">Written from {state.basedOn} of your recent captions. Edit freely before posting.</p>
          <ul className="captions">
            {state.drafts.map((d, i) => (
              <li key={i}>
                <p>{d}</p>
                <div className="row">
                  <CopyButton text={d} />
                  <a className="button button-small" href={`/publish?caption=${encodeURIComponent(d)}`}>Post with this caption</a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
