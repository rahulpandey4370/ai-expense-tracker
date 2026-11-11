'use server';

import { getSupabase } from '@/lib/supabase';
import { addTransaction } from '@/lib/actions/transactions';
import { sendPush } from '@/lib/push';
import { revalidatePath } from 'next/cache';

export interface PendingTransaction {
  id: string;
  rawText: string;
  sender: string | null;
  date: string; // YYYY-MM-DD
  amount: number;
  description: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  expenseType: 'need' | 'want' | 'investment' | 'investment_expense' | null;
  confidence: number | null;
  createdAt: string;
}

export interface PendingConfirmInput {
  date: string;
  amount: number;
  description: string;
  categoryId: string;
  paymentMethodId: string;
  expenseType: 'need' | 'want' | 'investment' | 'investment_expense';
}

export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  const { data, error } = await getSupabase()
    .from('pending_transactions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load SMS inbox: ${error.message}`);
  return (data ?? []).map(r => ({
    id: r.id,
    rawText: r.raw_text,
    sender: r.sender,
    date: r.date,
    amount: Number(r.amount),
    description: r.description,
    categoryId: r.category_id,
    paymentMethodId: r.payment_method_id,
    expenseType: r.expense_type,
    confidence: r.confidence === null ? null : Number(r.confidence),
    createdAt: r.created_at,
  }));
}

export async function getPendingCount(): Promise<number> {
  const { count } = await getSupabase()
    .from('pending_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

export async function confirmPendingTransaction(id: string, input: PendingConfirmInput): Promise<void> {
  const supabase = getSupabase();
  // Claim it first so a double tap can't create two transactions.
  const { data: claimed, error } = await supabase
    .from('pending_transactions')
    .update({ status: 'confirmed', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('account_hint');
  if (error) throw new Error(`Could not confirm: ${error.message}`);
  if (!claimed?.length) throw new Error('This SMS was already confirmed or dismissed.');

  let txId: string;
  try {
    const tx = await addTransaction({
      type: 'expense',
      // Noon IST, so the stored calendar day is exactly `input.date`.
      date: new Date(`${input.date}T12:00:00+05:30`),
      amount: input.amount,
      description: input.description,
      categoryId: input.categoryId,
      paymentMethodId: input.paymentMethodId,
      expenseType: input.expenseType,
    });
    txId = tx.id;
  } catch (e) {
    await supabase.from('pending_transactions').update({ status: 'pending', resolved_at: null }).eq('id', id);
    throw e;
  }

  await supabase.from('pending_transactions').update({ transaction_id: txId }).eq('id', id);

  // Remember which payment method this card/account is, for the next SMS.
  const hint = claimed[0].account_hint;
  if (hint) {
    await supabase.from('sms_account_hints').upsert({
      account_hint: hint,
      payment_method_id: input.paymentMethodId,
      updated_at: new Date().toISOString(),
    });
  }
  revalidatePath('/pending');
}

export async function dismissPendingTransaction(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('pending_transactions')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(`Could not dismiss: ${error.message}`);
  revalidatePath('/pending');
}

export async function savePushSubscription(sub: {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}, userAgent?: string): Promise<void> {
  if (!sub.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Invalid push subscription.');
  }
  const { error } = await getSupabase().from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent?.slice(0, 300) ?? null,
  });
  if (error) throw new Error(`Could not save subscription: ${error.message}`);
}

export async function sendTestPush(): Promise<number> {
  return sendPush({
    title: '✅ FinWise notifications are on',
    body: "You'll get budget alerts, SMS review prompts and a 9 PM daily summary.",
    url: '/',
    tag: 'test',
  });
}
