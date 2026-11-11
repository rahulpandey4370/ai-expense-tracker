// AI reading of a bank SMS, shared by the SMS webhook and the SMS Inbox "AI" button.
// The model only ever sees a redacted copy (see redactSms); amount and date come
// from the SMS itself, never from the model.
import { getSupabase } from '@/lib/supabase';
import { redactSms } from '@/lib/sms';
import { parseTransactionsFromText } from '@/ai/flows/parse-transactions-flow';

export const SMS_MODEL = 'openai::gpt-5.6-luna';
const FALLBACK_CATEGORY = /^(others?|misc(ellaneous)?|general|uncategori[sz]ed)$/i;
const EXPENSE_TYPES = ['need', 'want', 'investment', 'investment_expense'] as const;
type ExpenseType = (typeof EXPENSE_TYPES)[number];

export interface SmsGuess {
  aiOk: boolean;              // false = model failed/returned nothing; fields hold fallbacks
  description: string | null;
  date: string | null;        // what the model read; callers decide whether to trust it
  categoryId: string | null;
  categoryName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  expenseType: ExpenseType | null;
  confidence: number | null;
}

export async function guessFromSms(sms: {
  text: string;
  sender: string | null;
  amount: number;
  accountHint: string | null;
  note?: string;              // your own words from the inbox, e.g. "team lunch"
}): Promise<SmsGuess> {
  const supabase = getSupabase();
  const [{ data: categories }, { data: paymentMethods }, { data: hintRows }] = await Promise.all([
    supabase.from('categories').select('id, name, type').eq('type', 'expense'),
    supabase.from('payment_methods').select('id, name'),
    sms.accountHint
      ? supabase.from('sms_account_hints').select('payment_method_id').eq('account_hint', sms.accountHint).limit(1)
      : Promise.resolve({ data: [] as { payment_method_id: string }[] }),
  ]);

  // Payment method names often hold card digits or your name ("CC HDFC 7950").
  // The model gets masked, unique aliases ("CC HDFC", "CC HDFC #2"); we map back by id.
  const aliasCount = new Map<string, number>();
  const methodAliases = (paymentMethods ?? []).map(p => {
    const base = redactSms(p.name.replace(/\b\d{3,6}\b/g, '')).replace(/\s+/g, ' ').trim() || 'Card';
    const n = (aliasCount.get(base.toLowerCase()) ?? 0) + 1;
    aliasCount.set(base.toLowerCase(), n);
    return { id: p.id, name: n > 1 ? `${base} #${n}` : base };
  });

  const amount = `₹${sms.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const note = sms.note?.trim() ? redactSms(sms.note.trim()).slice(0, 500) : '';
  const prompt = [
    `This is a bank SMS alert for ONE completed debit (money I spent) of ${amount}. Return exactly one expense of ${amount}.`,
    'Personal details are masked as [NAME], [PHONE], [EMAIL], [OTP], [BALANCE], [REF] and XXXX. Ignore them; never put them in the description.',
    'Description: short and human with one fitting emoji, like "🍔 Swiggy order", "🛒 Amazon purchase", "⛽ Fuel at HP". Find the merchant or payee after "to", "at", "towards", "trf to", "Info:" or in the UPI handle (swiggy@icici → Swiggy, zomato-order@ybl → Zomato, paytmqr…@paytm → a shop QR payment). If the payee is a masked person or unclear, write "💸 UPI transfer" / "💳 Card payment".',
    'Category: the closest one from the list for that merchant; use Others only when nothing fits.',
    'Payment method: from the bank (sender code like VM-HDFCBK = HDFC, AX-ICICIB = ICICI) and the channel: UPI or VPA → the UPI method, "credit card" → that bank\'s credit card, "debit card" or POS → debit card, ATM withdrawal → cash, NEFT/IMPS/net banking → that bank account.',
    'Need/want: essentials (groceries, rent, bills, utilities, fuel, medicine, commute, insurance) are need; dining out, food delivery, shopping, entertainment, travel for fun are want.',
    note && `My own note about this payment, trust it over the SMS for description, category, need/want and payment method: "${note}"`,
    `SMS${sms.sender ? ` from ${sms.sender}` : ''}: ${redactSms(sms.text)}`,
  ].filter(Boolean).join('\n');

  let parsed: Awaited<ReturnType<typeof parseTransactionsFromText>>['parsedTransactions'][number] | undefined;
  try {
    const result = await parseTransactionsFromText({
      naturalLanguageText: prompt,
      categories: (categories ?? []) as { id: string; name: string; type: 'expense' }[],
      paymentMethods: methodAliases,
      model: SMS_MODEL,
    });
    parsed = result.parsedTransactions.find(t => t.type === 'expense') ?? result.parsedTransactions[0];
  } catch (e) {
    console.error('SMS AI parse failed:', e);
  }

  const byName = <T extends { name: string }>(list: T[] | null, name?: string | null) =>
    name ? list?.find(x => x.name.toLowerCase() === name.toLowerCase()) : undefined;
  const category = byName(categories, parsed?.categoryNameGuess) ?? categories?.find(c => FALLBACK_CATEGORY.test(c.name));
  const learned = paymentMethods?.find(p => p.id === hintRows?.[0]?.payment_method_id);
  const aiAlias = byName(methodAliases, parsed?.paymentMethodNameGuess);
  const aiMethod = paymentMethods?.find(p => p.id === aiAlias?.id);
  // A card you've confirmed before beats an AI guess, unless your note says otherwise.
  const method = note ? aiMethod ?? learned : learned ?? aiMethod;
  const expenseType = EXPENSE_TYPES.find(t => t === parsed?.expenseTypeNameGuess) ?? null;

  return {
    aiOk: !!parsed,
    description: parsed?.description?.trim() || null,
    date: parsed?.date ?? null,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    paymentMethodId: method?.id ?? null,
    paymentMethodName: method?.name ?? null,
    expenseType,
    confidence: parsed?.confidenceScore ?? null,
  };
}
