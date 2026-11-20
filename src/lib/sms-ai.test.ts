// Run: npx tsx --test src/lib/sms-ai.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smsPromptText } from './sms-ai';
import { canonicalMerchant, canonicalizeDescription } from './merchants';
import { DESCRIPTION_RULES, PARSE_TRANSACTIONS_PROMPT } from '@/ai/flows/parse-transactions-prompt';

test('SMS goes through the shared description rules, with no style rules of its own', () => {
  // The SMS text is the {{{naturalLanguageText}}} of the same prompt typed text uses.
  assert.ok(PARSE_TRANSACTIONS_PROMPT.includes(DESCRIPTION_RULES));
  assert.ok(PARSE_TRANSACTIONS_PROMPT.includes('{{{naturalLanguageText}}}'));
  const sms = smsPromptText({ text: 'Rs.1250 debited to VPA swiggy@icici', sender: 'VM-HDFCBK', amount: 1250 });
  assert.match(sms, /one expense of ₹1,250/);
  assert.match(sms, /Info:/);
  assert.match(sms, /VM-HDFCBK = HDFC/);
  assert.doesNotMatch(sms, /short and human|Need\/want:|Category:|Swiggy order/i);
});

test('Zerodha variants from real SMS collapse to one name per product', () => {
  for (const v of ['NSE Zerodha Coins', 'Zerodha Coins investment', 'Zerodha Coin investment', 'NSE Zerodha Coins investment'])
    assert.equal(canonicalMerchant(v), 'Zerodha Coin', v);
  for (const v of ['Zerodha Broking Limited', 'Zerodha Broking investment', 'Zerodha investment', 'Zerodha Broking Limited investment'])
    assert.equal(canonicalMerchant(v), 'Zerodha Kite', v);
});

test('only the merchant part of a description is rewritten, and only when it is just a brand', () => {
  const cases: [string, string][] = [
    ['📈 NSE Zerodha Coins: Parag Parikh Flexi Cap Fund ₹2,000', '📈 Zerodha Coin: Parag Parikh Flexi Cap Fund ₹2,000'],
    ['📈 Zerodha Broking Limited investment', '📈 Zerodha Kite'],
    ['🍽️ Eternal Lim', '🍽️ Zomato'],
    ['🛒 swiggy instamart purchase', '🛒 Swiggy Instamart'],
    // left alone: extra words that aren't filler, or no known brand
    ['🍽️ Swiggy at Taco Bell: Boss Burrito', '🍽️ Swiggy at Taco Bell: Boss Burrito'],
    ['🛒 Swiggy Instamart: Milk, Curd', '🛒 Swiggy Instamart: Milk, Curd'],
    ['📈 Coin Mutual Fund Investment: Parag Parikh', '📈 Coin Mutual Fund Investment: Parag Parikh'],
    ['🚕 Goa Trip Day 4: Taxi', '🚕 Goa Trip Day 4: Taxi'],
    ['💸 UPI transfer', '💸 UPI transfer'],
  ];
  for (const [input, want] of cases) assert.equal(canonicalizeDescription(input), want, input);
});
