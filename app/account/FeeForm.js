'use client';

import { useActionState } from 'react';
import { saveSettings } from '../inbox/actions';

export default function FeeForm({ currentFee, currentEmail }) {
  const [state, action, pending] = useActionState(saveSettings, null);
  return (
    <form action={action} className="form form-inline">
      <h2>Settings</h2>
      <label htmlFor="fee">Your fee per post (USD)</label>
      <input id="fee" name="fee" inputMode="decimal" defaultValue={state?.values?.fee ?? currentFee} placeholder="350" />
      <span className="small">Clients only see your page once a fee is set. Clear it to stop taking campaigns.</span>
      <label htmlFor="email">Email for campaign alerts</label>
      <input id="email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email ?? currentEmail} placeholder="you@example.com" />
      <span className="small">pipp emails you when a campaign arrives, a caption is approved, or a post goes live.</span>
      {state?.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      {state?.message && <p className="notice" role="status">{state.message}</p>}
      <button className="button button-small" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
