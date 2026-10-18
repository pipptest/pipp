import { NextResponse } from 'next/server';
import { randomState } from '../../../../lib/crypto';
import { authorizeUrl, isConfigured, siteOrigin } from '../../../../lib/instagram';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isConfigured()) {
    return NextResponse.redirect(siteOrigin(request) + '/connect?error=not_configured');
  }
  const state = randomState();
  const res = NextResponse.redirect(authorizeUrl(request, state));
  res.cookies.set('pipp_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
