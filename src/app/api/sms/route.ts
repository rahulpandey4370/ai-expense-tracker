// Called by the iPhone Shortcut when a bank SMS arrives.
// POST { "text": "<sms body>", "sender": "<sender>" } with Authorization: Bearer SMS_INGEST_TOKEN.
// Debit alerts become a pending transaction + a "Log it?" push; everything else is skipped.
import { NextResponse } from 'next/server';
import cuid from 'cuid';
import { getSupabase } from '@/lib/supabase';
import { hasBearer } from '@/lib/bearer';
import { isDebitAlert, extractAmount, extractAccountHint, smsHash } from '@/lib/sms';
import { parseTransactionsFromText } from '@/ai/flows/parse-transactions-flow';
import { getDefaultModelForTask } from '@/lib/task-models';
import { getAppCalendarDayString } from '@/lib/date-utils';
import { sendPush } from '@/lib/push';

export const runtime = 'nodejs';
export const maxDuration = 30;

const FALLBACK_CATEGORY = /^(others?|misc(ellaneous)?|general|uncategori[sz]ed)$/i;
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

  const accountHint = extractAccountHint(text);
  const [{ data: categories }, { data: paymentMethods }, { data: hintRows }] = await Promise.all([
    supabase.from('categories').select('id, name, type').eq('type', 'expense'),
    supabase.from('payment_methods').select('id, name'),
    accountHint
      ? supabase.from('sms_account_hints').select('payment_method_id').eq('account_hint', accountHint).limit(1)
      : Promise.resolve({ data: [] as { payment_method_id: string }[] }),
  ]);

  // AI fills merchant, category, payment method and need/want. The amount is
  // already known from the SMS, so the AI is told it and can't change it.
  let parsed: Awaited<ReturnType<typeof parseTransactionsFromText>>['parsedTransactions'][number] | undefined;
  try {
    const result = await parseTransactionsFromText({
      naturalLanguageText: [
        `This is a bank SMS alert for ONE completed debit (money I spent) of ${inr(amount)}.`,
        'Return exactly one expense. The merchant/payee is the "to", "at", "trf to" or VPA name; ignore balance, limit and reference numbers.',
        'Pick the payment method from the bank name, card/account type (credit card, debit card, UPI, net banking, ATM) and last digits.',
        `SMS: ${text}`,
      ].join('\n'),
      categories: (categories ?? []) as { id: string; name: string; type: 'expense' }[],
      paymentMethods: paymentMethods ?? [],
      model: getDefaultModelForTask('transaction_parsing'),
    });
    parsed = result.parsedTransactions.find(t => t.type === 'expense') ?? result.parsedTransactions[0];
  } catch (e) {
    console.error('SMS AI parse failed, saving with defaults:', e);
  }

  const byName = <T extends { name: string }>(list: T[] | null, name?: string | null) =>
    name ? list?.find(x => x.name.toLowerCase() === name.toLowerCase()) : undefined;

  const today = getAppCalendarDayString(new Date())!;
  const threeDaysAgo = getAppCalendarDayString(new Date(Date.now() - 3 * 864e5))!;
  // SMS arrive in real time; only trust an AI-read date if it's within the last 3 days.
  const date = parsed?.date && parsed.date >= threeDaysAgo && parsed.date <= today ? parsed.date : today;

  const row = {
    id: cuid(),
    raw_text: text,
    sender,
    text_hash: textHash,
    account_hint: accountHint,
    date,
    amount,
    description: parsed?.description?.trim() || `💸 ${sender ?? 'Bank'} debit`,
    category_id: (byName(categories, parsed?.categoryNameGuess) ?? categories?.find(c => FALLBACK_CATEGORY.test(c.name)))?.id ?? null,
    payment_method_id: hintRows?.[0]?.payment_method_id ?? byName(paymentMethods, parsed?.paymentMethodNameGuess)?.id ?? null,
    expense_type: parsed?.expenseTypeNameGuess ?? null,
    confidence: parsed?.confidenceScore ?? null,
  };

  const { error } = await supabase.from('pending_transactions').insert(row);
  if (error?.code === '23505') return NextResponse.json({ status: 'duplicate' });
  if (error) {
    console.error('Could not save pending SMS transaction:', error.message);
    return NextResponse.json({ error: 'could not save' }, { status: 500 });
  }

  const pmName = paymentMethods?.find(p => p.id === row.payment_method_id)?.name;
  const catName = categories?.find(c => c.id === row.category_id)?.name;
  try {
    await sendPush({
      title: `📩 Log ${inr(amount)}?`,
      body: [row.description, [pmName, catName].filter(Boolean).join(' · '), 'Tap to review'].filter(Boolean).join('\n'),
      url: '/pending',
      tag: `sms-${row.id}`,
    });
  } catch (e) {
    console.error('SMS push failed (transaction still saved for review):', e);
  }

  return NextResponse.json({ status: 'pending', id: row.id, amount, description: row.description });
}
