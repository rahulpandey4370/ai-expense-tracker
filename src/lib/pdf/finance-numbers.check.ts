// Run: npx tsx src/lib/pdf/finance-numbers.check.ts
import assert from 'node:assert/strict';
import { financeNumbers, financeByMonth } from './finance-numbers';

const t = (o: any) => ({ id: Math.random().toString(), date: '2026-01-15', description: 'x', amount: 0, type: 'expense', ...o });
const txs: any[] = [
  t({ type: 'income', amount: 10000, description: 'Salary' }),
  t({ amount: 2000, myShare: 1500, expenseType: 'need', category: { name: 'Rent' }, description: 'Rent: Jan' }),
  t({ amount: 1000, expenseType: 'want', category: { name: 'Food' } }),
  t({ amount: 500, source: 'sms', description: null }),                                              // untyped, no category, null description
  t({ amount: 3000, expenseType: 'want', category: { name: 'Mutual Funds' }, date: '2026-02-01' }), // investment by category wins over 'want'
];
const n = financeNumbers(txs);
assert.equal(n.income, 10000);
assert.equal(n.needs, 1500);
assert.equal(n.wants, 1000);
assert.equal(n.invested, 3000);
assert.equal(n.other, 500);
assert.equal(n.spending, 3000);           // needs + wants + other
assert.equal(n.saved, 4000);              // income − spending − invested
assert.equal(n.categories.find(c => c.name === 'Mutual Funds')?.value, 3000); // screen includes investments in categories
assert.equal(n.categories.find(c => c.name === 'sms')?.value, 500);           // falls back to source like the screen
assert.equal(financeNumbers([t({ amount: 100, expenseType: 'need' })]).saved, -100);

const months = financeByMonth(txs);
assert.deepEqual(months.map(m => m.m), [0, 1]);
assert.equal(months[1].invested, 3000);
console.log('ok');
