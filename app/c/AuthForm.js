'use client';

import { useActionState } from 'react';
import { logIn, signUp } from './actions';

export default function AuthForm({ mode }) {
  const [state, action, pending] = useActionState(mode === 'signup' ? signUp : logIn, null);
  return (
    <form action={action} className="form">
      {mode === 'signup' && (
        <>
          <label htmlFor="name">Your name or label</label>
          <input id="name" name="name" autoComplete="organization" required defaultValue={state?.values?.name} />
        </>
      )}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        minLength={mode === 'signup' ? 10 : undefined}
        required
      />
      {state?.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      <button className="button" type="submit" disabled={pending}>
        {mode === 'signup' ? (pending ? 'Creating account…' : 'Create account') : pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
