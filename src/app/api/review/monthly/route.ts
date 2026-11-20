// Called on the 1st at 8 AM IST by Supabase pg_cron (supabase/chat.sql).
// Authorization: Bearer CRON_SECRET. Optional body { year, month } (month 0-11) to re-run a month.
import { NextResponse } from 'next/server';
import { hasBearer } from '@/lib/bearer';
import { sendPushOnce } from '@/lib/push';
import { runMonthlyReview } from '@/ai/adk/monthly-review';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  // Last month, by the IST calendar.
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const defaultMonth = ist.getUTCMonth() === 0 ? 11 : ist.getUTCMonth() - 1;
  const defaultYear = ist.getUTCMonth() === 0 ? ist.getUTCFullYear() - 1 : ist.getUTCFullYear();
  const month = Number.isInteger(body.month) && body.month >= 0 && body.month <= 11 ? body.month : defaultMonth;
  const year = Number.isInteger(body.year) ? body.year : defaultYear;
  try {
    const review = await runMonthlyReview({ year, month });
    const pushed = await sendPushOnce(`monthly-review-${year}-${month}`, {
      title: `Your ${review.title} is ready`,
      body: review.preview.slice(0, 140),
      url: `/chatbot?chat=${review.sessionId}`,
      tag: 'monthly-review',
    });
    return NextResponse.json({ sessionId: review.sessionId, title: review.title, pushed });
  } catch (e: any) {
    console.error('Monthly review failed:', e);
    return NextResponse.json({ error: e?.message ?? 'failed' }, { status: 500 });
  }
}
