// Called by the iPhone Shortcut when a bank SMS arrives.
// POST { "text": "<sms body>", "sender": "<sender>" } with Authorization: Bearer SMS_INGEST_TOKEN.
// Debit alerts become a pending transaction + a "Log it?" push; everything else is skipped.
import { NextResponse } from 'next/server';
import cuid from 'cuid';
import { getSupabase } from '@/lib/supabase';
import { hasBearer } from '@/lib/bearer';
import { isDebitAlert, extractAmount, extractAccountHint, smsHash } from '@/lib/sms';
import { guessFromSms } from '@/lib/sms-ai';
import { getAppCalendarDayString } from '@/lib/date-utils';
import { sendPush } from '@/lib/push';

export const runtime = 'nodejs';
export const maxDuration = 30;

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export async function POST(req: Request) {
  if (!hasBearer(req, process.env.SMS_INGEST_TOKEN)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const sender = typeof body?.sender === 'string' ? body.sender.trim().slice(0, 100) : null;
  if (text.length < 10 || text.length > 1500) {
    return NextResponse.json({ error: 'text must be 10-1500 characters' }, { status: 400 });
  }

  if (!isDebitAlert(text)) return NextResponse.json({ status: 'skipped', reason: 'not a completed debit' });
  const amount = extractAmount(text);
  if (!amount) return NextResponse.json({ status: 'skipped', reason: 'no amount found' });

  const supabase = getSupabase();
  const textHash = smsHash(text);
  const { data: existing } = await supabase.from('pending_transactions').select('id').eq('text_hash', textHash).limit(1);
  if (existing?.length) return NextResponse.json({ status: 'duplicate' });

  // Card digits are read here, locally; the AI only gets a redacted copy.
  const accountHint = extractAccountHint(text);
  const guess = await guessFromSms({ text, sender, amount, accountHint });

  const today = getAppCalendarDayString(new Date())!;
  const threeDaysAgo = getAppCalendarDayString(new Date(Date.now() - 3 * 864e5))!;
  // SMS arrive in real time; only trust an AI-read date if it's within the last 3 days.
  const date = guess.date && guess.date >= threeDaysAgo && guess.date <= today ? guess.date : today;

  const row = {
    id: cuid(),
    raw_text: text,
    sender,
    text_hash: textHash,
    account_hint: accountHint,
    date,
    amount,
    description: guess.description || `💸 ${sender ?? 'Bank'} debit`,
    category_id: guess.categoryId,
    payment_method_id: guess.paymentMethodId,
    expense_type: guess.expenseType,
    confidence: guess.confidence,
  };

  const { error } = await supabase.from('pending_transactions').insert(row);
  if (error?.code === '23505') return NextResponse.json({ status: 'duplicate' });
  if (error) {
    console.error('Could not save pending SMS transaction:', error.message);
    return NextResponse.json({ error: 'could not save' }, { status: 500 });
  }

  try {
    await sendPush({
      title: `📩 Log ${inr(amount)}?`,
      body: [row.description, [guess.paymentMethodName, guess.categoryName].filter(Boolean).join(' · '), 'Tap to review'].filter(Boolean).join('\n'),
      url: '/pending',
      tag: `sms-${row.id}`,
    });
  } catch (e) {
    console.error('SMS push failed (transaction still saved for review):', e);
  }

  return NextResponse.json({ status: 'pending', id: row.id, amount, description: row.description });
}
