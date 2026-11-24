// Run: npx tsx src/lib/split/receipt.check.ts
import assert from 'node:assert/strict';
import { cleanReceipt, decodeDataUri } from './receipt';

const ids = ['me', 'maya', 'noah'];
const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((a, x) => a + x.amount, 0) * 100) / 100;

// items short of the total (tax/service) → one extra line makes it add up
let r = cleanReceipt({ merchant: 'Ramiro', date: '2026-11-20', total: 1180, items: [{ name: 'Pasta', amount: 600, memberIds: [] }, { name: 'Wine', amount: 400, memberIds: ['maya'] }] }, ids);
assert.equal(r.amount, 1180);
assert.equal(sum(r.items), 1180);
assert.ok(r.items.some(i => /tax|service/i.test(i.name) && i.amount === 180));
// unassigned items are shared by everyone; invented ids dropped
assert.deepEqual(r.items[0].memberIds, ids);
assert.deepEqual(r.items[1].memberIds, ['maya']);

// discount: items over the total → scaled down to the total, paise exact
r = cleanReceipt({ merchant: 'Cafe', date: null, total: 900, items: [{ name: 'A', amount: 500, memberIds: ['ghost'] }, { name: 'B', amount: 500, memberIds: [] }] }, ids);
assert.equal(sum(r.items), 900);
assert.deepEqual(r.items[0].memberIds, ids, 'ghost id dropped → everyone');

// no total read → total is the items' sum
r = cleanReceipt({ merchant: '', date: null, total: null, items: [{ name: 'Tea', amount: 40, memberIds: [] }] }, ids);
assert.equal(r.amount, 40);
assert.equal(r.description, 'Receipt');

// nothing readable
r = cleanReceipt({ merchant: 'X', date: null, total: null, items: [] }, ids);
assert.equal(r.amount, null);

// data URIs: type + size limits
assert.equal(decodeDataUri('data:image/png;base64,iVBORw0KGgo=')?.mime, 'image/png');
assert.equal(decodeDataUri('data:text/html;base64,PGgxPg=='), null, 'only images/PDF');
assert.equal(decodeDataUri('not a data uri'), null);

console.log('ok');
