import { NextResponse } from 'next/server';
import { siteOrigin } from '../../../../lib/instagram';
import { randomState, startLogin } from '../../../../lib/link';
import { authorizeUrl, isConfigured } from '../../../../lib/x';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isConfigured()) return NextResponse.redirect(siteOrigin(request) + '/connect?error=not_configured&platform=x');
  const state = randomState();
  const verifier = randomState() + randomState();
  return startLogin(authorizeUrl(request, state, verifier), state, { pipp_x_verifier: verifier });
}
