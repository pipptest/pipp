import { NextResponse } from 'next/server';
import { authorizeUrl, isConfigured, siteOrigin } from '../../../../lib/instagram';
import { randomState, startLogin } from '../../../../lib/link';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isConfigured()) return NextResponse.redirect(siteOrigin(request) + '/connect?error=not_configured&platform=instagram');
  const state = randomState();
  return startLogin(authorizeUrl(request, state), state);
}
