import { redirect } from 'next/navigation';
import { currentClient } from '../../../lib/clientAuth';
import AuthForm from '../AuthForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create an account · pipp for labels' };

export default async function SignUp() {
  if (await currentClient()) redirect('/c');
  return (
    <main>
      <article className="doc">
        <p className="tag">For labels and artists</p>
        <h1>Create an account</h1>
        <p className="date">Send paid campaigns straight to the pages on pipp.</p>
        <AuthForm mode="signup" />
        <p className="small">Already have an account? <a href="/c/login">Log in</a></p>
      </article>
    </main>
  );
}
