// Run: npx tsx src/lib/split/math.check.ts
import assert from 'node:assert/strict';
import { resolveShares, computeBalances, simplifyDebts, ownerSpending } from './math';

const sum = (r: Record<string, number>) => Math.round(Object.values(r).reduce((a, b) => a + b, 0) * 100) / 100;

// equal: leftover paisa goes to the first participant, total is exact
let r = resolveShares(100, 'equal', { participants: ['a', 'b', 'c'] });
assert.deepEqual(r.shares, { a: 33.34, b: 33.33, c: 33.33 });
assert.equal(sum(r.shares), 100);

// percent
r = resolveShares(1000, 'percent', { participants: ['a', 'b', 'c'], values: { a: 33.33, b: 33.33, c: 33.34 } });
assert.equal(r.error, undefined);
assert.equal(sum(r.shares), 1000);
assert.equal(resolveShares(1000, 'percent', { participants: ['a', 'b'], values: { a: 50, b: 40 } }).error?.includes('%'), true);

// exact must add up
r = resolveShares(100, 'exact', { participants: ['a', 'b'], values: { a: 30, b: 50 } });
assert.ok(r.error?.includes('left'), r.error);
r = resolveShares(100, 'exact', { participants: ['a', 'b'], values: { a: 30, b: 80 } });
assert.ok(r.error?.includes('over'), r.error);
r = resolveShares(100, 'exact', { participants: ['a', 'b'], values: { a: 30, b: 70 } });
assert.deepEqual(r.shares, { a: 30, b: 70 });

// shares 2:1
r = resolveShares(90, 'shares', { participants: ['a', 'b'], values: { a: 2, b: 1 } });
assert.deepEqual(r.shares, { a: 60, b: 30 });

// items: pizza 60 for a+b, wine 40 for b
r = resolveShares(100, 'items', { participants: ['a', 'b'], items: [
  { name: 'pizza', amount: 60, memberIds: ['a', 'b'] },
  { name: 'wine', amount: 40, memberIds: ['b'] },
] });
assert.deepEqual(r.shares, { a: 30, b: 70 });
assert.ok(resolveShares(120, 'items', { participants: ['a'], items: [{ name: 'x', amount: 100, memberIds: ['a'] }] }).error);

// cover: one person owes it all
r = resolveShares(100, 'cover', { participants: ['a', 'b'], coveredBy: 'b' });
assert.deepEqual(r.shares, { b: 100 });

// no participants
assert.ok(resolveShares(100, 'equal', { participants: [] }).error);

// balances: a paid 90 split 3 ways, c paid b back 30 → b settled? b owes 30 to a
const bal = computeBalances(['a', 'b', 'c'],
  [{ paidBy: 'a', shares: { a: 30, b: 30, c: 30 } }],
  [{ from: 'c', to: 'a', amount: 30 }]);
assert.deepEqual(bal, { a: 30, b: -30, c: 0 });
assert.equal(sum(bal), 0);

// simplify: a +50, b -30, c -20 → 2 transfers to a
const t = simplifyDebts({ a: 50, b: -30, c: -20 });
assert.equal(t.length, 2);
assert.deepEqual(t, [{ from: 'b', to: 'a', amount: 30 }, { from: 'c', to: 'a', amount: 20 }]);
// chain a→b→c collapses to one transfer
assert.deepEqual(simplifyDebts({ a: -10, b: 0, c: 10 }), [{ from: 'a', to: 'c', amount: 10 }]);

// owner's personal ledger row for a group expense
assert.deepEqual(ownerSpending(300, 'me', { me: 100, a: 200 }, 'me'), { involved: true, amount: 300, myShare: 100 }, 'I paid: cash out is the full bill, spend is my share');
assert.deepEqual(ownerSpending(300, 'a', { me: 100, a: 200 }, 'me'), { involved: true, amount: 100, myShare: 100 }, 'friend paid: I owe my share');
assert.deepEqual(ownerSpending(300, 'me', { a: 300 }, 'me'), { involved: true, amount: 300, myShare: 0 }, 'I covered a friend');
assert.deepEqual(ownerSpending(300, 'a', { a: 300 }, 'me'), { involved: false, amount: 0, myShare: 0 }, 'not involved');
assert.deepEqual(ownerSpending(300, 'a', { a: 300 }, undefined), { involved: false, amount: 0, myShare: 0 }, 'no owner in group');

console.log('ok');
