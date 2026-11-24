// Run: npx tsx src/lib/split/voice.check.ts
import assert from 'node:assert/strict';
import { cleanDraft } from './voice';

const base = { amount: 96, description: 'Dinner', date: null, paidBy: null, method: 'equal' as const, participants: [], values: [], items: [], coveredBy: null, question: null, confident: true };
const ids = ['me', 'maya', 'noah'];

// payer defaults to the speaker; "everyone" when no names
let d = cleanDraft(base, ids, 'me');
assert.equal(d.paidBy, 'me');
assert.deepEqual(d.meta.participants, ids);
assert.equal(d.confident, true);

// invented ids are dropped, never trusted
d = cleanDraft({ ...base, paidBy: 'ghost', participants: ['maya', 'ghost'], coveredBy: 'ghost' }, ids, 'me');
assert.equal(d.paidBy, 'me');
assert.deepEqual(d.meta.participants, ['maya']);
assert.equal(d.meta.coveredBy, undefined);

// Maya's wine 12, rest split three ways
d = cleanDraft({ ...base, method: 'items', items: [{ name: 'Wine', amount: 12, memberIds: ['maya'] }, { name: 'Rest', amount: 84, memberIds: ids }] }, ids, 'me');
assert.equal(d.question, null);
assert.equal(d.confident, true);

// missing amount → one question, not saved blindly
d = cleanDraft({ ...base, amount: null }, ids, 'me');
assert.equal(d.question, 'How much was it?');
assert.equal(d.confident, false);

// items that don't add up → ask instead of saving
d = cleanDraft({ ...base, method: 'items', items: [{ name: 'Wine', amount: 12, memberIds: ['maya'] }] }, ids, 'me');
assert.ok(d.question?.includes('left'));
assert.equal(d.confident, false);

console.log('ok');
