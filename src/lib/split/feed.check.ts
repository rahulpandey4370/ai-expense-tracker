// npx tsx src/lib/split/feed.check.ts
import assert from 'node:assert/strict';
import { feedMonths, filterActivity, monthRange } from './feed';
import type { ActivityItem } from './types';

const a = (id: string, groupId: string, date: string, people: string[]): ActivityItem => ({
  id, groupId, groupName: groupId, groupEmoji: null, emoji: null, paidByMe: false, kind: 'expense', title: id, who: '',
  amount: 10, myImpact: 0, at: `${date}T10:00:00Z`, date, people,
});
const items = [
  a('hotel', 'goa', '2026-11-03', ['s@x.com']),
  a('bus', 'goa', '2026-11-12', ['s@x.com']),
  a('rent', 'flat', '2026-10-01', ['name:bo']),
  { ...a('paid', 'flat', '2026-02-14', ['name:bo']), kind: 'settlement' as const },
];
const ids = (f: Parameters<typeof filterActivity>[1]) => filterActivity(items, f).map(i => i.id);

assert.deepEqual(ids({}), ['hotel', 'bus', 'rent', 'paid']);
assert.deepEqual(ids({ groupId: 'goa' }), ['hotel', 'bus']);
assert.deepEqual(ids({ person: 'name:bo' }), ['rent', 'paid']); // settlements count for either party
assert.deepEqual(ids({ from: '2026-11-05' }), ['bus']);
assert.deepEqual(ids({ to: '2026-10-01' }), ['rent', 'paid']);
assert.deepEqual(ids({ from: '2026-10-01', to: '2026-11-03' }), ['hotel', 'rent']);
assert.deepEqual(ids({ groupId: 'flat', person: 'name:bo', ...monthRange('2026-02') }), ['paid']);

assert.deepEqual(feedMonths(items), ['2026-11', '2026-10', '2026-02']);
assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' });

console.log('ok');
