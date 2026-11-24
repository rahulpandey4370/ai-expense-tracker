// npx tsx src/lib/split/seed.check.ts
import assert from 'node:assert/strict';
import { draftFor } from './seed';
import type { GroupDetail } from './types';

const m = (id: string, name: string) => ({ id, name, email: null, upiId: null, isOwner: id === 'me', hasAccount: false, removed: false });
const d: GroupDetail = {
  group: { id: 'g', name: 'Goa', emoji: null, kind: 'trip', currency: 'INR', archived: false },
  members: [m('me', 'Rahul Pandey'), m('bo', 'Bo Li'), m('sh', 'Shivangi Singh')], expenses: [], settlements: [], balances: {},
  transfers: [], meMemberId: 'me', canManage: true, isOwnerViewer: true, shareToken: null,
};
const T = '2026-11-24';

// plain: paid by me, equally among everyone
const plain = draftFor(d, { amount: 300, description: 'Cab' }, T);
assert.equal(plain.paidBy, 'me');
assert.equal(plain.method, 'equal');
assert.deepEqual(plain.meta.participants, ['me', 'bo', 'sh']);

// old Quick split: Bo paid 1000, my share 400, nobody else → Bo's share is the rest (600); payer stays Bo
const boPaid = draftFor(d, { amount: 1000, mode: 'custom', paidByName: 'Bo Li', amountsByName: {}, myShare: 400 }, T);
assert.equal(boPaid.paidBy, 'bo');
assert.equal(boPaid.method, 'exact');
assert.deepEqual(boPaid.meta.values, { me: 400, bo: 600 });
assert.deepEqual([...boPaid.meta.participants!].sort(), ['bo', 'me']);

// old Quick split: I paid 900, Shivangi 300, my share 600
const iPaid = draftFor(d, { amount: 900, mode: 'custom', amountsByName: { 'Shivangi Singh': 300 }, myShare: 600 }, T);
assert.equal(iPaid.paidBy, 'me');
assert.deepEqual(iPaid.meta.values, { sh: 300, me: 600 });

// my share 0 (I paid it all for Shivangi): I'm not a participant
const forSh = draftFor(d, { amount: 500, mode: 'custom', amountsByName: { Shivangi: 500 }, myShare: 0 }, T);
assert.deepEqual(forSh.meta.values, { sh: 500 });
assert.deepEqual(forSh.meta.participants, ['sh']);

// someone else's charge → one person covers it
const notMine = draftFor(d, { amount: 250, mode: 'not_mine', participantNames: ['Bo'] }, T);
assert.equal(notMine.method, 'cover');
assert.equal(notMine.meta.coveredBy, 'bo');

console.log('ok');
