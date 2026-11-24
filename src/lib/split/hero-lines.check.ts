// npx tsx src/lib/split/hero-lines.check.ts
import assert from 'node:assert/strict';
import { groupLines, homeLines } from './hero-lines';
import type { ActivityItem, GroupDetail, HomeData } from './types';

const act = (title: string, date: string, amount: number, kind: ActivityItem['kind'] = 'expense'): ActivityItem => ({
  id: title, groupId: 'g', groupName: 'Goa', groupEmoji: null, emoji: null, paidByMe: true, kind, title, who: '', amount,
  myImpact: 0, at: `${date}T10:00:00Z`, date, people: [],
});
const home = (over: Partial<HomeData> = {}): HomeData => ({
  me: { name: 'Rahul', email: 'r@x.com', isOwner: true }, totals: { owed: 0, owe: 0 }, groups: [], people: [], activity: [],
  weekCount: 0, spentByMonth: [], unlinked: [], ...over,
});

// nothing yet → a prompt, never made-up examples
assert.deepEqual(homeLines(home(), '2026-11-24'), ['Tap here to log an expense']);

assert.deepEqual(homeLines(home({
  spentByMonth: [{ month: '2026-10', amount: 999 }, { month: '2026-11', amount: 10460 }],
  people: [
    { key: 'a', name: 'Bo Li', net: -250, groups: [] },
    { key: 's', name: 'Shivangi Singh', net: 10616, groups: [] },
    { key: 'z', name: 'Zed', net: 0.004, groups: [] },
    { key: 'c', name: 'Cy', net: 50, groups: [] },
  ],
  activity: [act('Goa Ibis Hotel', '2026-11-03', 14920), act('Old rent', '2026-10-01', 50000), act('Paid back', '2026-11-20', 90000, 'settlement'), act('Bus', '2026-11-12', 3688)],
  weekCount: 1,
}), '2026-11-24'), [
  'You spent ₹10,460 this month',
  'Shivangi owes you ₹10,616',
  'You owe Bo ₹250',
  'Biggest this month: Goa Ibis Hotel, ₹14,920',
  '1 expense logged this week',
]);

const m = (id: string, name: string) => ({ id, name, email: null, upiId: null, isOwner: false, hasAccount: false, removed: false });
const exp = (description: string, amount: number, shares: Record<string, number>) => ({
  id: description, description, amount, date: '2026-11-03', emoji: null, method: 'exact' as const, paidBy: 'me', createdBy: 'me',
  shares, meta: {}, inMySpending: false, createdAt: '2026-11-03T00:00:00Z',
});
const group = (over: Partial<GroupDetail> = {}): GroupDetail => ({
  group: { id: 'g', name: 'Goa Trip', emoji: null, kind: 'trip', currency: 'INR', archived: false },
  members: [m('me', 'Rahul Pandey'), m('s', 'Shivangi Singh'), m('b', 'Bo')], expenses: [], settlements: [], balances: {}, transfers: [],
  meMemberId: 'me', canManage: true, isOwnerViewer: true, shareToken: null, ...over,
});

assert.deepEqual(groupLines(group()), ['Tap here to log an expense']);
assert.deepEqual(groupLines(group({
  expenses: [exp('Hotel', 14920, { me: 7460, s: 7460 }), exp('Bus', 3688, { me: 1844, s: 1844 })],
  transfers: [{ from: 's', to: 'me', amount: 10616 }, { from: 'b', to: 's', amount: 5 }],
})), [
  '₹18,608 spent in Goa Trip',
  'Shivangi owes you ₹10,616',
  'Biggest: Hotel, ₹14,920',
  'Your share so far: ₹9,304',
]);

console.log('ok');
