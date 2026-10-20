'use client';

import { useActionState } from 'react';
import { saveSettings } from '../inbox/actions';

export default function FeeForm({ accounts, currentEmail }) {
  const [state, action, pending] = useActionState(saveSettings, null);
  return (
    <form action={action} className="form form-inline">
      <h2>Settings</h2>
      {accounts.map((a) => (
        <div key={a.key} className="fee-field">
          <label htmlFor={`fee-${a.key}`}>Fee per post on {a.label} (@{a.username}), USD</label>
          <input id={`fee-${a.key}`} name={`fee:${a.key}`} inputMode="decimal"
            defaultValue={state?.values?.fees?.[a.key] ?? a.fee} placeholder="350" />
        </div>
      ))}
      <span className="small">Clients only see an account once it has a fee. Clear a fee to stop taking campaigns there.</span>
      <label htmlFor="email">Email for campaign alerts</label>
      <input id="email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email ?? currentEmail} placeholder="you@example.com" />
      <span className="small">pipp emails you when a campaign arrives, a caption is approved, or a post goes live.</span>
      {state?.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      {state?.message && <p className="notice" role="status">{state.message}</p>}
      <button className="button button-small" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
