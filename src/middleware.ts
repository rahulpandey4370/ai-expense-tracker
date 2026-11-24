import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { userFromClaims } from '@/lib/auth/roles';

// Paths reachable without signing in. Each API listed here does its own auth
// (bearer secrets for cron/SMS, owner/member/share-token checks for /api/split).
const PUBLIC = [/^\/login$/, /^\/auth\//, /^\/s\//, /^\/demo/, /^\/api\/sms/, /^\/api\/notify\//, /^\/api\/review\//, /^\/api\/split$/];
// Pages a signed-in friend (non-owner) may open.
const FRIEND = [/^\/groups/, /^\/s\//];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  let user = null;
  const url = process.env.SUPABASE_PROJECT_URL, key = process.env.SUPABASE_ANON_KEY;
  if (url && key) { // missing config fails closed: everyone is treated as signed out
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: list => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getClaims(); // verifies the JWT and refreshes the session
    user = userFromClaims(data?.claims);
  }
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith('/api/');
  // Keep any refreshed session cookies on early responses too.
  const keep = (r: NextResponse) => { res.cookies.getAll().forEach(c => r.cookies.set(c)); return r; };

  // Every server action in this app reads or writes the owner's finances, and Next runs actions
  // from any POST to a page (with or without a Next-Action header). Pages never take other POSTs,
  // so only owners may POST outside /api (which authorises itself) and /auth.
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if ((req.headers.has('next-action') || (isWrite && !isApi && !path.startsWith('/auth/'))) && !user?.isOwner) {
    return keep(new NextResponse('Forbidden', { status: 403 }));
  }

  if (PUBLIC.some(r => r.test(path))) return res;

  if (!user) {
    if (isApi) return keep(NextResponse.json({ error: 'Sign in required' }, { status: 401 }));
    const login = new URL('/login', req.url);
    login.searchParams.set('next', path + req.nextUrl.search);
    return keep(NextResponse.redirect(login));
  }

  if (!user.isOwner && !FRIEND.some(r => r.test(path))) {
    if (isApi) return keep(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    return keep(NextResponse.redirect(new URL('/groups', req.url)));
  }

  return res;
}

export const config = {
  // Skip only real static files: Next's own assets, /fonts/*.ttf (PDFs for link guests) and top-level files in /public. A nested
  // "/portfolio/a.png" is a dynamic page and must still pass through the gate.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-[^/]*$|fonts/[^/]+\\.ttf$|[^/]+\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)'],
};
