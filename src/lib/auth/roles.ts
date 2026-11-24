/** Owners get the whole app; anyone else who signs in only sees their split groups. */
export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const owners = (process.env.OWNER_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return owners.includes(email.toLowerCase());
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
}

/** Builds our user from verified JWT claims (getClaims). */
export function userFromClaims(claims: Record<string, any> | null | undefined): SessionUser | null {
  if (!claims?.sub || !claims.email) return null;
  const meta = claims.user_metadata ?? {};
  return {
    id: String(claims.sub),
    email: String(claims.email),
    name: String(meta.full_name ?? meta.name ?? String(claims.email).split('@')[0]),
    isOwner: isOwnerEmail(claims.email),
  };
}

/** Only same-origin paths, so a login link can't bounce users to another site. */
export function safeNext(next: string | null): string {
  if (!next || /[\u0000-\u001F\u007F\\]/.test(next)) return '/';
  try {
    const base = 'http://local.invalid';
    const u = new URL(next, base);
    return u.origin === base ? u.pathname + u.search + u.hash : '/';
  } catch {
    return '/';
  }
}
