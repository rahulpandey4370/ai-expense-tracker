// Run: npx tsx src/lib/split/report.check.ts
import assert from 'node:assert/strict';
import { groupReportData, personReportData, monthRange, simplifiedDiffers } from './report';

const members = [
  { id: 'me', name: 'Rahul', email: null, upiId: null, isOwner: true, hasAccount: true, removed: false },
  { id: 'a', name: 'Asha', email: null, upiId: null, isOwner: false, hasAccount: false, removed: false },
];
const ex = (id: string, date: string, amount: number, paidBy: string, shares: Record<string, number>) =>
  ({ id, description: id, amount, date, emoji: null, method: 'exact' as const, paidBy, createdBy: paidBy, shares, meta: {}, inMySpending: false, createdAt: `${date}T10:00:00Z` });
const detail: any = {
  group: { id: 'g', name: 'Flat', emoji: '🏠', kind: 'home', currency: 'INR', archived: false },
  members, meMemberId: 'me',
  expenses: [ex('oct-rent', '2026-10-05', 2000, 'me', { me: 1000, a: 1000 }), ex('nov-food', '2026-11-03', 600, 'a', { me: 300, a: 300 }), ex('dec-cab', '2026-12-01', 100, 'me', { me: 50, a: 50 })],
  settlements: [{ id: 's1', from: 'a', to: 'me', amount: 400, date: '2026-11-20', note: null, createdBy: 'a', createdAt: '2026-11-20T10:00:00Z' }],
};

assert.deepEqual(monthRange('2026-11'), { from: '2026-11-01', to: '2026-11-30' });
assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });

const r = groupReportData(detail, '2026-11-01', '2026-11-30');
assert.deepEqual(r.expenses.map(e => e.id), ['nov-food'], 'only November');
assert.equal(r.totalSpent, 600);
assert.equal(r.myShare, 300);
assert.equal(r.settlements.length, 1);
// per person, this period: Asha paid 600, owed 300, paid me back 400 → +700 for the period; me −700
assert.deepEqual(r.people.map(p => [p.id, p.paid, p.share, p.net]), [['me', 0, 300, -700], ['a', 600, 300, 700]]);
// balance as of 30 Nov counts October too: Oct +1000 me, Nov −300 me, settlement −400 me → Asha owes me 300
assert.deepEqual(r.transfers, [{ from: 'a', to: 'me', amount: 300 }]);
assert.equal(r.myBalanceAtEnd, 300);

const person: any = {
  key: 'name:asha', name: 'Asha', net: 350, groups: [{ groupId: 'g', groupName: 'Flat', groupEmoji: '🏠', net: 350 }],
  items: [
    { kind: 'expense', id: 'dec-cab', date: '2026-12-01', impact: 50, amount: 100 },
    { kind: 'settlement', id: 's1', date: '2026-11-20', impact: -400, amount: 400 },
    { kind: 'expense', id: 'nov-food', date: '2026-11-03', impact: -300, amount: 600 },
  ],
};
const pr = personReportData(person, '2026-11-01', '2026-11-30');
assert.deepEqual(pr.items.map((i: any) => i.id), ['s1', 'nov-food']);
assert.equal(pr.periodNet, -700, 'Nov: I owed 300 more, and they paid me 400 (which lowers what they owe)');
assert.equal(pr.sharedSpend, 600);

// Balance follows the group's simplified settle-up; flag when it doesn't equal the rows' total (50 − 400 − 300 = −650 ≠ 350).
assert.equal(simplifiedDiffers(person), true);
assert.equal(simplifiedDiffers({ ...person, net: -650 }), false);

console.log('ok');
