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

const MONEY = String.raw`(?:rs\.?|inr|₹)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Mask personal details before an SMS (or a note) is sent to an AI model:
 * OTPs, balances/limits, card/account digits, phone numbers, emails, long
 * reference numbers, "Dear <name>" and any names in SMS_REDACT_NAMES
 * (comma-separated, e.g. "Rahul,Pandey"). Merchant names and UPI handles stay,
 * the AI needs them. Only the copy sent to the model is masked; the stored SMS is not.
 */
export function redactSms(text: string, names = (process.env.SMS_REDACT_NAMES ?? '').split(',')): string {
  let t = text
    .replace(/\b(otp|one[ -]time password|passcode|code|pin)(\W{1,15})\d{4,8}\b/gi, '$1$2[OTP]')
    .replace(/\b\d{4,8}(?=\s+is\s+(?:your|the)\s+(?:otp|one[ -]time|code|pin))/gi, '[OTP]')
    .replace(new RegExp(String.raw`\b(avl\.?\s*bal(?:ance)?|available\s+(?:bal(?:ance)?|limit|lmt)|avl\.?\s*lmt|bal(?:ance)?|limit|lmt|outstanding)([^0-9]{0,20}?)${MONEY}`, 'gi'), '$1$2[BALANCE]')
    .replace(/[\w.+-]+@[\w-]+\.[a-z][\w.]*/gi, '[EMAIL]')
    .replace(/(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g, '[PHONE]')
    .replace(/\b\d{9,}\b/g, '[REF]')
    .replace(/(\bx+|\*+)\d{3,6}\b/gi, 'XXXX')
    .replace(/\b(a\/c|acct?|account|card)(\s*(?:no\.?|number)?\s*[:.]?\s*)\d{3,6}\b/gi, '$1$2XXXX')
    .replace(/\b(ending(?:\s+with|\s+in)?\s*)\d{3,6}\b/gi, '$1XXXX')
    .replace(/\b(dear|hi|hello)\s+(?!(?:customer|user|sir|madam|cardholder|card ?member|upi user|valued)\b)[a-z][a-z.]*(?:\s+[a-z][a-z.]*)?(?=\s*[,!:])/gi, '$1 [NAME]');
  for (const name of names.map(n => n.trim()).filter(n => n.length >= 2)) {
    t = t.replace(new RegExp(`\\b${escapeRe(name)}\\b`, 'gi'), '[NAME]');
  }
  return t;
}

export function smsHash(text: string): string {
  return createHash('sha256').update(text.trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex');
}
