// Run: npx tsx src/lib/split/splitwise.check.ts
import assert from 'node:assert/strict';
import { parseCsv, parseSplitwise, splitwiseToLedger } from './splitwise';
import { computeBalances } from './math';

const CSV = '﻿Date,Description,Category,Cost,Currency,Rahul Pandey,Asha,Ben\r\n'
  + '\r\n'
  + '2026-01-05,Groceries,Groceries,300.00,INR,200.00,-100.00,-100.00\r\n'
  + '2026-01-06,"Dinner, beach ""shack""",Dining out,900.00,INR,-300.00,600.00,-300.00\r\n'
  + '2026-01-07,Asha paid Rahul Pandey,Payment,100.00,INR,-100.00,100.00,0.00\r\n'
  + '2026-01-08,Villa,Rent,1000.00,INR,200.00,200.00,-400.00\r\n'
  + '2026-01-08,Own lunch,Food,50.00,INR,0.00,0.00,0.00\r\n'
  + '2026-01-09,Souvenir,Gifts,20.00,USD,10.00,-10.00,0.00\r\n'
  + '\r\n'
  + '2026-01-09,Total balance, , ,INR,0.00,800.00,-800.00\r\n'
  + '2026-01-09,Total balance, , ,USD,10.00,-10.00,0.00\r\n';

// CSV basics: quotes, escaped quotes, CRLF, BOM
assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n1,2,3'), [['a', 'b,c', 'd "e"'], ['1', '2', '3']]);

const p = parseSplitwise(CSV);
assert.deepEqual(p.members, ['Rahul Pandey', 'Asha', 'Ben']);
assert.equal(p.rows.length, 6);
assert.equal(p.rows[1].description, 'Dinner, beach "shack"');
assert.equal(p.currency, 'INR', 'most common currency wins');
assert.deepEqual(p.totals, [0, 800, -800]);

const l = splitwiseToLedger(p);
// single payer: payer's share = cost − their net
assert.deepEqual(l.expenses[0], { date: '2026-01-05', description: 'Groceries', category: 'Groceries', amount: 300, paidBy: 0, shares: { 0: 100, 1: 100, 2: 100 } });
assert.deepEqual(l.expenses[1].shares, { 0: 300, 1: 300, 2: 300 });
// payment row → settlement from the one who paid (positive) to the one paid (negative)
assert.deepEqual(l.settlements[0], { date: '2026-01-07', from: 1, to: 0, amount: 100, note: 'Asha paid Rahul Pandey' });
// two payers: expense keeps its cost, the other payer's part becomes a settlement
const villa = l.expenses.find(e => e.description === 'Villa')!;
assert.equal(villa.amount, 1000);
assert.equal(villa.paidBy, 0);
assert.deepEqual(villa.shares, { 0: 600, 2: 400 });
assert.ok(l.settlements.some(s => s.from === 1 && s.to === 0 && s.amount === 200));
// zero-effect rows and other currencies are skipped, and said so
assert.equal(l.skipped.zero, 1);
assert.equal(l.skipped.otherCurrency, 1);
assert.ok(!l.expenses.some(e => e.description === 'Own lunch' || e.description === 'Souvenir'));

// rebuilt balances match Splitwise's own total row
const bal = computeBalances(['0', '1', '2'],
  l.expenses.map(e => ({ paidBy: String(e.paidBy), shares: Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, v])) })),
  l.settlements.map(s => ({ from: String(s.from), to: String(s.to), amount: s.amount })));
assert.deepEqual(bal, { 0: 0, 1: 800, 2: -800 });
assert.equal(l.balanceMismatch, false);

// not a Splitwise export
assert.throws(() => parseSplitwise('foo,bar\n1,2'), /Splitwise/);

console.log('ok');
