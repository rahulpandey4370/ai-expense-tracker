// Run: npx tsx --test src/lib/sms.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDebitAlert, extractAmount, extractAccountHint, smsHash } from './sms';

const debits: [string, number, string | null][] = [
  ['Rs.500.00 debited from A/c XX1234 on 11-11-26 to VPA swiggy@icici (UPI Ref No 431234567890). Not you? Call 18002586161', 500, '1234'],
  ['INR 1,250.00 spent on HDFC Bank Card XX9876 at AMAZON on 2026-11-11:10:15:22. Avl Lmt: INR 50,000.00', 1250, '9876'],
  ['Sent Rs.200.00 From HDFC Bank A/C *4321 To RAHUL KUMAR On 11/11/26 Ref 431299887766 Not You? Call 18002586161', 200, '4321'],
  ['Dear UPI user A/C X5678 debited by 120.0 on date 11Nov26 trf to ZOMATO Refno 431211112222. If not u? call 1800111109 -SBI', 120, '5678'],
  ['ICICI Bank Acct XX123 debited for Rs 349.00 on 11-Nov-26; NETFLIX credited. UPI:431255556666. Call 18002662 for dispute. Avl Bal Rs 10,000.00', 349, '123'],
  ['Your A/c XX1111 is debited for Rs 2,000.00 on 11-Nov-26 (ATM WDL). Avl Bal: Rs 8,500.00', 2000, '1111'],
];

const notSpends = [
  '123456 is your OTP for txn of INR 999.00 at FLIPKART on card XX9876. Do not share it with anyone.',
  'Rs 649.00 will be debited from your card XX9876 on 15-Nov-26 for NETFLIX e-mandate.',
  'Your HDFC Credit Card bill of Rs 12,340.00 is due on 20-Nov-26.',
  'Txn of Rs 450.00 on card XX9876 at UBER declined due to insufficient limit.',
  'Rs 500.00 credited to your A/c XX1234 on 11-11-26 from VPA friend@okaxis.',
  'Refund of Rs 299.00 for your order has been credited to card XX9876.',
  'Get a pre-approved loan of Rs 5,00,000 at 10.5%. Click here to apply now.',
  'RAHUL has requested Rs 300.00 from you on Google Pay. Approve on the app.',
];

test('real debit alerts are accepted with the right amount and card digits', () => {
  for (const [sms, amount, hint] of debits) {
    assert.ok(isDebitAlert(sms), `should accept: ${sms}`);
    assert.equal(extractAmount(sms), amount, sms);
    assert.equal(extractAccountHint(sms), hint, sms);
  }
});

test('OTPs, scheduled debits, bills, failures, credits, promos and requests are skipped', () => {
  for (const sms of notSpends) assert.ok(!isDebitAlert(sms), `should skip: ${sms}`);
});

test('hash ignores whitespace and case so a re-sent SMS is a duplicate', () => {
  assert.equal(smsHash('Rs 5 debited  from XX1'), smsHash(' rs 5 DEBITED from xx1 '));
});
