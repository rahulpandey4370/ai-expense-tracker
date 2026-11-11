// Called at 9 PM IST by Supabase pg_cron (supabase/notifications.sql).
// Authorization: Bearer CRON_SECRET
import { NextResponse } from 'next/server';
import { hasBearer } from '@/lib/bearer';
import { sendDailyNotifications } from '@/lib/notifications';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendDailyNotifications());
  } catch (e: any) {
    console.error('Daily notifications failed:', e);
    return NextResponse.json({ error: e?.message ?? 'failed' }, { status: 500 });
  }
}
