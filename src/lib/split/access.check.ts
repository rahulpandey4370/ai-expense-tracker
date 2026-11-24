// Run: npx tsx src/lib/split/access.check.ts
import assert from 'node:assert/strict';
import { safeNext } from '../auth/roles';
import { canSeeGroup, pickMe, canEditMember, type Access, type MemberRow } from './access';

const members: MemberRow[] = [
  { id: 'm1', group_id: 'g1', name: 'Rahul', email: 'owner@x.com', user_id: 'u-owner', is_owner: true, removed_at: null },
  { id: 'm2', group_id: 'g1', name: 'Asha', email: 'asha@x.com', user_id: null, removed_at: null },
  { id: 'm3', group_id: 'g1', name: 'Ben', email: null, user_id: null, removed_at: null },
  { id: 'm4', group_id: 'g1', name: 'Gone', email: 'gone@x.com', user_id: 'u-gone', removed_at: '2026-01-01' },
];
const owner: Access = { user: { id: 'u-owner', email: 'owner@x.com', name: 'R', isOwner: true } };
const asha: Access = { user: { id: 'u-asha', email: 'Asha@X.com', name: 'A', isOwner: false } };
const stranger: Access = { user: { id: 'u-s', email: 's@x.com', name: 'S', isOwner: false } };
const otherOwner: Access = { user: { id: 'u-o2', email: 'o2@x.com', name: 'O', isOwner: true } };
const guestG1: Access = { tokenGroupId: 'g1' };
const guestG2: Access = { tokenGroupId: 'g2' };
const removed: Access = { user: { id: 'u-gone', email: 'gone@x.com', name: 'G', isOwner: false } };

assert.equal(canSeeGroup(owner, 'g1', members), true);
assert.equal(canSeeGroup(asha, 'g1', members), true, 'friend matched by email (case-insensitive)');
assert.equal(canSeeGroup(stranger, 'g1', members), false, 'non-member friend');
assert.equal(canSeeGroup(otherOwner, 'g1', members), false, 'owners only see groups they belong to');
assert.equal(canSeeGroup(guestG1, 'g1', members), true, 'share link for this group');
assert.equal(canSeeGroup(guestG2, 'g1', members), false, 'share link for another group');
assert.equal(canSeeGroup(removed, 'g1', members), false, 'removed member');
assert.equal(canSeeGroup({}, 'g1', members), false, 'nobody');

assert.equal(pickMe(owner, members)?.id, 'm1');
assert.equal(pickMe(asha, members)?.id, 'm2');
assert.equal(pickMe(guestG1, members, 'm3')?.id, 'm3', 'guest picks who they are');
assert.equal(pickMe(guestG1, members, 'm4'), null, 'guest cannot pick a removed member');
assert.equal(pickMe(guestG1, members, 'nope'), null);
assert.equal(pickMe(guestG1, members), null);

// who may edit a person's name/email/UPI (UPI = where money gets sent)
assert.equal(canEditMember(owner, members, 'm1'), true, 'own seat');
assert.equal(canEditMember(owner, members, 'm3'), true, 'member edits a seat with no account');
const ashaClaimed = members.map(m => m.id === 'm2' ? { ...m, user_id: 'u-asha' } : m);
assert.equal(canEditMember(owner, ashaClaimed, 'm2'), false, "not another account-holder's seat");
assert.equal(canEditMember(asha, ashaClaimed, 'm2'), true, 'friend edits own seat');
assert.equal(canEditMember(guestG1, members, 'm3'), false, 'link guests edit nobody');
assert.equal(canEditMember(stranger, members, 'm3'), false, 'non-member');

// login redirect target stays on this site
assert.equal(safeNext('/groups?x=1'), '/groups?x=1');
for (const bad of ['//evil.com', '/\\evil.com', '/\t/evil.com', 'https://evil.com', '/\n/evil.com', null]) {
  assert.equal(safeNext(bad as string | null), '/', String(bad));
}

console.log('ok');
