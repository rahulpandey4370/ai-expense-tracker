import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { userFromClaims, type SessionUser } from './roles';

// The anon key is deliberately server-only: OAuth starts in /auth/login, so the
// browser never holds a key that could talk to PostgREST.
function authEnv() {
  const url = process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Auth is not configured (SUPABASE_PROJECT_URL / SUPABASE_ANON_KEY).');
  return { url, key };
}

/** Cookie-backed Supabase auth client for route handlers and server components. */
export async function createAuthClient() {
  const { url, key } = authEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        // Server components can't set cookies; middleware refreshes them instead.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}

/** The signed-in user (JWT verified), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createAuthClient();
    const { data } = await supabase.auth.getClaims();
    return userFromClaims(data?.claims);
  } catch {
    return null;
  }
}
