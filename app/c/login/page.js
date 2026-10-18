import { redirect } from 'next/navigation';
import { currentClient } from '../../../lib/clientAuth';
import AuthForm from '../AuthForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Log in · pipp for labels' };

export default async function Login() {
  if (await currentClient()) redirect('/c');
  return (
    <main>
      <article className="doc">
        <p className="tag">For labels and artists</p>
        <h1>Log in</h1>
        <AuthForm mode="login" />
        <p className="small">New to pipp? <a href="/c/signup">Create an account</a></p>
      </article>
    </main>
  );
}
