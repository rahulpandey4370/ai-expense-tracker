// Deterministic helpers for bank SMS alerts. These run before (and check)
// the AI parse, so OTPs, promos and failed payments never reach your inbox,
// and the amount comes from the SMS text itself, not from an AI guess.
import { createHash } from 'crypto';

const DEBIT_WORDS = /\b(debited|debit(?:ed)? for|spent|sent|paid|withdrawn|withdrawal|purchase|txn of|transaction of|used at|charged|deducted|tranx? of)\b/i;

// Anything that means "not a completed spend": OTPs, future/scheduled debits,
// payment requests, failures, reversals, bills due, promos.
const NOT_A_SPEND = /\b(otp|one[ -]time password|do not share|will be debited|to be debited|is due|due on|due date|due by|requested|request of|collect request|reminder|scheduled|mandate|autopay set|declined|failed|unsuccessful|reversed|reversal|refund(?:ed)?|offer|pre-?approved|loan|apply now|click here)\b/i;

const CURRENCY_AMOUNT = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
// "debited by 120.0", "debited for Rs 349", "spent INR 1,250.00"
const AMOUNT_AFTER_DEBIT = /\b(?:debited|spent|sent|paid|withdrawn|charged|deducted)\s*(?:by|for|with|of)?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
// Words right before an amount that make it a balance/limit, not the spend.
const BALANCE_PREFIX = /(bal(?:ance)?|lmt|limit|avl|available|outstanding)[^0-9]{0,15}$/i;

const toNumber = (s: string) => Number(s.replace(/,/g, ''));

export function isDebitAlert(text: string): boolean {
  return DEBIT_WORDS.test(text) && !NOT_A_SPEND.test(text);
}

/** The spent amount in the SMS, skipping balance/limit figures. null if none. */
export function extractAmount(text: string): number | null {
  const near = AMOUNT_AFTER_DEBIT.exec(text);
  if (near) {
    const n = toNumber(near[1]);
    if (n > 0) return n;
  }
  for (const m of text.matchAll(CURRENCY_AMOUNT)) {
    const before = text.slice(Math.max(0, m.index! - 25), m.index);
    if (BALANCE_PREFIX.test(before)) continue;
    const n = toNumber(m[1]);
    if (n > 0) return n;
  }
  return null;
}

/** Last 3-4 digits of the card/account ("XX1234", "*1234", "ending 1234"). */
export function extractAccountHint(text: string): string | null {
  const m = /(?:\bx{1,}|\*+|\bending(?: with)?\s*|\ba\/c(?: no\.?)?\s*x*|\bcard(?: no\.?)?\s*x*)\s?(\d{3,4})\b/i.exec(text);
  return m ? m[1] : null;
}

export function smsHash(text: string): string {
  return createHash('sha256').update(text.trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex');
}
