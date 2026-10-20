import { NextResponse } from 'next/server';
import { siteOrigin } from '../../../../lib/instagram';
import { randomState, startLogin } from '../../../../lib/link';
import { authorizeUrl, isConfigured } from '../../../../lib/tiktok';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isConfigured()) return NextResponse.redirect(siteOrigin(request) + '/connect?error=not_configured&platform=tiktok');
  const state = randomState();
  return startLogin(authorizeUrl(request, state), state);
}
