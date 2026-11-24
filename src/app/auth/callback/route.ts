import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@/lib/auth/supabase-server';
import { userFromClaims, safeNext } from '@/lib/auth/roles';
import { getSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  if (!code) return NextResponse.redirect(new URL('/login?error=oauth', req.url));

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/login?error=oauth', req.url));

  const { data } = await supabase.auth.getClaims();
  const user = userFromClaims(data?.claims);
  if (!user) return NextResponse.redirect(new URL('/login?error=oauth', req.url));

  // A friend the owner added by email claims those group seats on first sign-in.
  // Google verifies the email, so matching on it is safe.
  await getSupabase()
    .from('split_members')
    .update({ user_id: user.id })
    .eq('email', user.email.toLowerCase()) // emails are stored lowercased
    .is('user_id', null)
    .then(() => {}, () => {}); // table may not exist yet; never block sign-in on it
  // The owner's own seats in imported/legacy groups have no email yet.
  if (user.isOwner) {
    await getSupabase().from('split_members').update({ user_id: user.id, email: user.email.toLowerCase() })
      .eq('is_owner', true).is('user_id', null).is('email', null).then(() => {}, () => {});
  }

  const dest = user.isOwner ? next : next.startsWith('/groups') || next.startsWith('/s/') ? next : '/groups';
  return NextResponse.redirect(new URL(dest, req.url));
}
