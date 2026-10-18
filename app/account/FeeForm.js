'use client';

import { useActionState } from 'react';
import { saveFee } from '../inbox/actions';

export default function FeeForm({ current }) {
  const [state, action, pending] = useActionState(saveFee, null);
  return (
    <form action={action} className="form form-inline">
      <label htmlFor="fee">Your fee per post (USD)</label>
      <div className="row">
        <input id="fee" name="fee" inputMode="decimal" defaultValue={state?.value ?? current} placeholder="350" />
        <button className="button button-small" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save fee'}</button>
      </div>
      <span className="small">Pages only appear to clients once a fee is set. Clear it to stop taking campaigns.</span>
      {state?.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      {state?.message && <p className="notice" role="status">{state.message}</p>}
    </form>
  );
}
