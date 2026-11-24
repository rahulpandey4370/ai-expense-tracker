import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@/lib/auth/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}
