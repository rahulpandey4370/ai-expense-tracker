import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@/lib/auth/supabase-server';
import { safeNext } from '@/lib/auth/roles';

// Starts Google sign-in on the server (PKCE verifier lands in a cookie).
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${req.nextUrl.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return NextResponse.redirect(new URL('/login?error=oauth', req.url));
  return NextResponse.redirect(data.url);
}

