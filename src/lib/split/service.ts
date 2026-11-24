// Group split ledger. Every exported op takes an Access and checks it via openGroup()
// (or myGroupIds() for the signed-in home view) before touching data.
import cuid from 'cuid';
import { randomBytes } from 'node:crypto';
import { getSupabase } from '@/lib/supabase';
import { isOwnerEmail, type SessionUser } from '@/lib/auth/roles';
import { resolveShares, computeBalances, simplifyDebts, ownerSpending, type SplitMethod, type SplitItem } from './math';
import { canSeeGroup, pickMe, canEditMember, type Access, type MemberRow } from './access';
import { importMemberRows, parseSplitwise, splitwiseToLedger } from './splitwise';
import { parseVoiceDraft } from './voice';
import { decodeDataUri, removeGroupReceipts, removeReceipt, scanReceiptDraft, signedReceiptUrl, storeReceipt } from './receipt';
import { emojiFor } from './emoji';
import type {
  ActivityItem, Expense, GroupDetail, GroupInfo, GroupKind, GroupSummary, HomeData, Member, PersonBalance, Settlement,
} from './types';

export class SplitError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const db = () => getSupabase();
const r2 = (n: number) => Math.round(n * 100) / 100;
const nowIso = () => new Date().toISOString();

async function must<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- loading ----------

interface Loaded {
  groups: any[];
  members: MemberRow[];
  expenses: any[];
  settlements: any[];
}

// ponytail: loads whole groups into memory; fine for friend-sized groups, page by date if one grows to thousands of rows.
async function loadGroups(ids: string[]): Promise<Loaded> {
  if (ids.length === 0) return { groups: [], members: [], expenses: [], settlements: [] };
  const [groups, members, expenses, settlements] = await Promise.all([
    must<any[]>(db().from('split_groups').select('*').in('id', ids)),
    must<MemberRow[]>(db().from('split_members').select('*').in('group_id', ids).order('created_at')),
    must<any[]>(db().from('split_expenses').select('*, split_expense_shares(member_id, amount)').in('group_id', ids)
      .order('date', { ascending: false }).order('created_at', { ascending: false })),
    must<any[]>(db().from('split_settlements').select('*').in('group_id', ids).order('created_at', { ascending: false })),
  ]);
  return { groups, members, expenses, settlements };
}

async function myGroupIds(user: SessionUser): Promise<string[]> {
  // Two plain queries instead of an .or() filter string, so the email is never parsed as filter syntax.
  const [byId, byEmail] = await Promise.all([
    must<{ group_id: string }[]>(db().from('split_members').select('group_id').eq('user_id', user.id).is('removed_at', null)),
    must<{ group_id: string }[]>(db().from('split_members').select('group_id').eq('email', user.email.toLowerCase()).is('removed_at', null)),
  ]);
  return [...new Set([...byId, ...byEmail].map(r => r.group_id))];
}

interface Opened {
  loaded: Loaded;
  group: any;
  members: MemberRow[];
  me: MemberRow | null;
  canManage: boolean;
}

/** Loads one group the caller may see; 404 otherwise (no hint the group exists). */
async function openGroup(access: Access, groupId: string, asMember?: string | null): Promise<Opened> {
  const loaded = await loadGroups([groupId]);
  const group = loaded.groups[0];
  if (!group || !canSeeGroup(access, groupId, loaded.members)) throw new SplitError(404, 'Group not found.');
  const me = pickMe(access, loaded.members, asMember);
  const ownSeat = !!access.user && !!me && pickMe({ user: access.user }, loaded.members)?.id === me.id;
  return { loaded, group, members: loaded.members, me, canManage: ownSeat };
}

const active = (members: MemberRow[]) => members.filter(m => !m.removed_at);

function requireActive(members: MemberRow[], ids: (string | undefined)[], what: string) {
  const ok = new Set(active(members).map(m => m.id));
  for (const id of ids) if (!id || !ok.has(id)) throw new SplitError(400, `${what} isn't in this group.`);
}

// ---------- mapping ----------

const toMember = (m: MemberRow): Member => ({
  id: m.id, name: m.name, email: m.email, upiId: m.upi_id ?? null,
  isOwner: !!m.is_owner, hasAccount: !!m.user_id, removed: !!m.removed_at,
});

const sharesOf = (e: any): Record<string, number> =>
  Object.fromEntries((e.split_expense_shares ?? []).map((s: any) => [s.member_id, Number(s.amount)]));

const toExpense = (e: any): Expense => ({
  id: e.id, description: e.description, amount: Number(e.amount), date: e.date, emoji: e.emoji,
  method: e.method, paidBy: e.paid_by, createdBy: e.created_by, shares: sharesOf(e), meta: e.meta ?? {},
  inMySpending: !!e.transaction_id, createdAt: e.created_at,
});

const toSettlement = (s: any): Settlement => ({
  id: s.id, from: s.from_member, to: s.to_member, amount: Number(s.amount), date: s.date,
  note: s.note, createdBy: s.created_by, createdAt: s.created_at,
});

const toInfo = (g: any): GroupInfo => ({
  id: g.id, name: g.name, emoji: g.emoji, kind: g.kind, currency: g.currency, archived: !!g.archived_at,
});

function ledgerOf(groupId: string, l: Loaded) {
  const members = l.members.filter(m => m.group_id === groupId);
  const expenses = l.expenses.filter(e => e.group_id === groupId).map(toExpense);
  const settlements = l.settlements.filter(s => s.group_id === groupId).map(toSettlement);
  const balances = computeBalances(members.map(m => m.id), expenses.map(e => ({ paidBy: e.paidBy, shares: e.shares })), settlements);
  return { members, expenses, settlements, balances, transfers: simplifyDebts(balances) };
}

// ---------- reads ----------

/** Identifies one person across groups: their email, else their name. */
const personKey = (m: MemberRow) => (m.email ? m.email.toLowerCase() : `name:${m.name.trim().toLowerCase()}`);

export async function getHome(user: SessionUser): Promise<HomeData> {
  // Seats created by the SQL import or the bridge have no owner yet; claim them here as well as at
  // sign-in, so Quick splits shows up even if the SQL ran after the owner last signed in.
  if (user.isOwner) {
    await db().from('split_members').update({ user_id: user.id, email: user.email.toLowerCase() })
      .eq('is_owner', true).is('user_id', null).is('email', null);
  }
  const loaded = await loadGroups(await myGroupIds(user));
  const groups: GroupSummary[] = [];
  const people = new Map<string, PersonBalance>();
  const activity: ActivityItem[] = [];
  const unlinked: HomeData['unlinked'] = [];
  const byMonth = new Map<string, number>();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  let weekCount = 0;

  for (const g of loaded.groups) {
    const { members, expenses, settlements, balances, transfers } = ledgerOf(g.id, loaded);
    const me = pickMe({ user }, members);
    if (!me) continue;
    const name = (id: string) => members.find(m => m.id === id)?.name ?? 'Someone';
    const lastActivity = [g.updated_at, expenses[0]?.createdAt, settlements[0]?.createdAt].filter(Boolean).sort().at(-1)!;
    groups.push({
      ...toInfo(g), myBalance: balances[me.id] ?? 0, memberCount: active(members).length,
      memberNames: active(members).filter(m => m.id !== me.id).map(m => m.name),
      myShareTotal: r2(expenses.reduce((a, e) => a + (e.shares[me.id] ?? 0), 0)),
      totalSpent: r2(expenses.reduce((a, e) => a + e.amount, 0)), lastActivity,
    });

    // Everyone I share this group with is listed (settled people too), so their history stays reachable.
    for (const m of active(members)) {
      if (m.id === me.id) continue;
      const key = personKey(m);
      if (!people.has(key)) people.set(key, { key, name: m.name, net: 0, groups: [] });
    }
    for (const t of transfers) {
      if (t.from !== me.id && t.to !== me.id) continue;
      const other = members.find(m => m.id === (t.from === me.id ? t.to : t.from))!;
      const key = personKey(other);
      const net = t.to === me.id ? t.amount : -t.amount;
      const p = people.get(key) ?? { key, name: other.name, net: 0, groups: [] };
      p.net = r2(p.net + net);
      p.groups.push({ groupId: g.id, groupName: g.name, net });
      people.set(key, p);
    }

    for (const e of expenses) {
      const mine = e.shares[me.id] ?? 0;
      if (e.createdAt >= weekAgo) weekCount++;
      if (mine > 0) byMonth.set(e.date.slice(0, 7), r2((byMonth.get(e.date.slice(0, 7)) ?? 0) + mine));
      activity.push({
        id: e.id, groupId: g.id, groupName: g.name, groupEmoji: g.emoji, emoji: e.emoji, paidByMe: e.paidBy === me.id,
        kind: 'expense', title: e.description, who: name(e.paidBy),
        amount: e.amount, myImpact: e.paidBy === me.id ? r2(e.amount - mine) : -mine, at: e.createdAt,
      });
      if (user.isOwner && mine > 0 && !e.inMySpending && !e.meta?.imported) {
        unlinked.push({ groupId: g.id, groupName: g.name, expenseId: e.id, description: e.description, myShare: mine, date: e.date });
      }
    }
    for (const s of settlements) {
      activity.push({
        id: s.id, groupId: g.id, groupName: g.name, groupEmoji: g.emoji, emoji: '💸', paidByMe: s.from === me.id,
        kind: 'settlement', title: `${name(s.from)} paid ${name(s.to)}`,
        who: name(s.from), amount: s.amount, myImpact: s.from === me.id ? -s.amount : s.to === me.id ? s.amount : 0, at: s.createdAt,
      });
    }
  }

  const peopleList = [...people.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
  return {
    me: { name: user.name, email: user.email, isOwner: user.isOwner },
    totals: {
      owed: r2(peopleList.filter(p => p.net > 0).reduce((a, p) => a + p.net, 0)),
      owe: r2(-peopleList.filter(p => p.net < 0).reduce((a, p) => a + p.net, 0)),
    },
    groups: groups.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)),
    people: peopleList,
    activity: activity.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60),
    weekCount,
    spentByMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, amount]) => ({ month, amount })),
    unlinked: unlinked.slice(0, 20),
  };
}

export async function getGroup(access: Access, groupId: string, asMember?: string | null): Promise<GroupDetail> {
  const o = await openGroup(access, groupId, asMember);
  const { members, expenses, settlements, balances, transfers } = ledgerOf(groupId, o.loaded);
  return {
    group: toInfo(o.group),
    // Link guests see names, not other people's email addresses.
    members: members.map(toMember).map(m => (o.canManage ? m : { ...m, email: null })),
    expenses, settlements, balances, transfers,
    meMemberId: o.me?.id ?? null,
    canManage: o.canManage,
    isOwnerViewer: !!access.user?.isOwner && o.canManage,
    shareToken: o.canManage ? o.group.share_token : null,
  };
}

// ---------- groups & members ----------

export async function createGroup(user: SessionUser, input: { name: string; emoji?: string | null; kind: GroupKind; members: { name: string; email?: string }[] }) {
  const id = cuid();
  const now = nowIso();
  await must(db().from('split_groups').insert({ id, name: input.name, emoji: input.emoji ?? null, kind: input.kind, created_at: now, updated_at: now }));
  const seen = new Set([user.email.toLowerCase()]);
  const rows = [
    { id: cuid(), group_id: id, name: user.name, email: user.email.toLowerCase(), user_id: user.id, is_owner: user.isOwner, created_at: now },
    ...input.members
      .filter(m => { const e = m.email?.toLowerCase(); if (!e) return true; if (seen.has(e)) return false; seen.add(e); return true; })
      .map(m => ({ id: cuid(), group_id: id, name: m.name, email: m.email?.toLowerCase() || null, user_id: null, is_owner: false, created_at: now })),
  ];
  await must(db().from('split_members').insert(rows));
  return { id };
}

async function manage(access: Access, groupId: string) {
  const o = await openGroup(access, groupId);
  if (!o.canManage) throw new SplitError(403, 'Only signed-in members can change this.');
  return o;
}

export async function updateGroup(access: Access, groupId: string, patch: { name?: string; emoji?: string | null; kind?: GroupKind; archived?: boolean }) {
  await manage(access, groupId);
  const row: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.emoji !== undefined) row.emoji = patch.emoji;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.archived !== undefined) row.archived_at = patch.archived ? nowIso() : null;
  await must(db().from('split_groups').update(row).eq('id', groupId));
  return { ok: true };
}

export async function deleteGroup(access: Access, groupId: string) {
  if (groupId === 'legacy') throw new SplitError(400, 'Quick splits mirrors your transactions and can\'t be deleted. Archive it instead.');
  await manage(access, groupId);
  await must(db().from('split_groups').delete().eq('id', groupId));
  await removeGroupReceipts(groupId); // private photos go with the group
  return { ok: true };
}

export async function addMember(access: Access, groupId: string, input: { name: string; email?: string; upiId?: string }) {
  const o = await openGroup(access, groupId);
  // An email lets that Google account into the group, and a UPI ID decides where money goes —
  // so link guests may add people by name only.
  if (!o.canManage && (input.email || input.upiId)) throw new SplitError(403, 'Sign in to invite people by email or set UPI IDs.');
  const email = input.email?.trim().toLowerCase() || null;
  if (email && active(o.members).some(m => m.email === email)) throw new SplitError(400, 'That email is already in this group.');
  const id = cuid();
  await must(db().from('split_members').insert({ id, group_id: groupId, name: input.name, email, upi_id: input.upiId || null, created_at: nowIso() }));
  return { id };
}

export async function updateMember(access: Access, groupId: string, memberId: string, input: { name?: string; email?: string | null; upiId?: string | null }) {
  const o = await openGroup(access, groupId);
  requireActive(o.members, [memberId], 'That person');
  if (!canEditMember(access, o.members, memberId)) throw new SplitError(403, "You can't change this person's details.");
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.email !== undefined) row.email = input.email?.trim().toLowerCase() || null;
  if (input.upiId !== undefined) row.upi_id = input.upiId || null;
  await must(db().from('split_members').update(row).eq('id', memberId).eq('group_id', groupId));
  return { ok: true };
}

export async function removeMember(access: Access, groupId: string, memberId: string) {
  const o = await manage(access, groupId);
  requireActive(o.members, [memberId], 'That person');
  const { balances } = ledgerOf(groupId, o.loaded);
  if (Math.abs(balances[memberId] ?? 0) >= 0.01) throw new SplitError(400, 'Settle up with this person before removing them.');
  await must(db().from('split_members').update({ removed_at: nowIso() }).eq('id', memberId).eq('group_id', groupId));
  return { ok: true };
}

export async function shareLink(access: Access, groupId: string, action: 'create' | 'revoke') {
  await manage(access, groupId);
  const token = action === 'create' ? randomBytes(32).toString('base64url') : null;
  await must(db().from('split_groups').update({ share_token: token, updated_at: nowIso() }).eq('id', groupId));
  return { token };
}

/** Group id unlocked by a share-link token, or undefined. */
export async function groupIdForToken(token: string | null): Promise<string | undefined> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const rows = await must<{ id: string }[]>(db().from('split_groups').select('id').eq('share_token', token).limit(1));
  return rows[0]?.id;
}

// ---------- expenses ----------

/** Quick-split rows mirror a transaction (see bridge.ts); they're edited from Transactions only. */
function assertNotBridged(expenseId?: string) {
  if (expenseId?.startsWith('legacy_')) throw new SplitError(400, 'This came from a transaction. Edit it on the Transactions page.');
}

export interface SpendingInput { categoryId: string; paymentMethodId: string; expenseType: 'need' | 'want' | 'investment' | 'investment_expense' }

export interface SaveExpenseInput {
  groupId: string;
  id?: string;
  description: string;
  amount: number;
  date: string;
  emoji?: string | null;
  method: SplitMethod;
  paidBy: string;
  participants: string[];
  values?: Record<string, number>;
  items?: SplitItem[];
  coveredBy?: string;
  asMember?: string | null;
  spending?: SpendingInput;
  /** What was said/typed to create it (voice, SMS note) — shown on the receipt view. */
  said?: string;
}

export async function saveExpense(access: Access, input: SaveExpenseInput) {
  assertNotBridged(input.id);
  const o = await openGroup(access, input.groupId, input.asMember);
  if (!o.me) throw new SplitError(400, 'Pick who you are first.');
  requireActive(o.members, [input.paidBy], 'The payer');
  const involved = input.method === 'cover' ? [input.coveredBy]
    : input.method === 'items' ? (input.items ?? []).flatMap(i => i.memberIds) : input.participants;
  requireActive(o.members, involved, 'Someone in this split');

  const { shares, error } = resolveShares(input.amount, input.method, {
    participants: input.participants, values: input.values, items: input.items, coveredBy: input.coveredBy,
  });
  if (error) throw new SplitError(400, error);

  const existing = input.id ? o.loaded.expenses.find(e => e.id === input.id) : undefined;
  if (input.id && !existing) throw new SplitError(404, 'Expense not found.');
  const id = existing?.id ?? cuid();
  // Re-read the receipt right before writing: a photo attached since the group loaded must survive this save.
  const freshReceipt = existing
    ? (await must<any[]>(db().from('split_expenses').select('meta').eq('id', existing.id).limit(1)))[0]?.meta?.receipt
    : undefined;

  await must(db().rpc('split_save_expense', {
    p_expense: {
      id, group_id: input.groupId, description: input.description, amount: input.amount, date: input.date,
      emoji: input.emoji ?? null, method: input.method, paid_by: input.paidBy,
      created_by: existing?.created_by ?? o.me.id, transaction_id: existing?.transaction_id ?? null,
      meta: {
        // keep what edits don't touch: the receipt photo, the original words, the import marker
        receipt: freshReceipt, imported: existing?.meta?.imported,
        said: input.said ?? existing?.meta?.said,
        participants: input.participants, values: input.values, items: input.items, coveredBy: input.coveredBy,
      },
    },
    p_shares: Object.entries(shares).map(([member_id, amount]) => ({ member_id, amount })),
  }));

  await syncSpending({
    id, description: input.description, amount: input.amount, date: input.date, paidBy: input.paidBy, shares,
    transactionId: existing?.transaction_id ?? null,
  }, o.members, !!access.user?.isOwner, access.user?.isOwner ? input.spending : undefined);
  return { id };
}

export async function deleteExpense(access: Access, groupId: string, expenseId: string) {
  assertNotBridged(expenseId);
  const o = await openGroup(access, groupId);
  const e = o.loaded.expenses.find(x => x.id === expenseId);
  if (!e) throw new SplitError(404, 'Expense not found.');
  await must(db().from('split_expenses').delete().eq('id', expenseId).eq('group_id', groupId));
  if (e.meta?.receipt) await removeReceipt(e.meta.receipt);
  // Only the owner removes their own personal transaction; for anyone else the FK just unlinks it.
  if (e.transaction_id && access.user?.isOwner) await must(db().from('transactions').delete().eq('id', e.transaction_id));
  return { ok: true };
}

/** Owner one-tap: put my share of a friend-added expense into my personal spending. */
export async function linkToSpending(access: Access, groupId: string, expenseId: string, spending: SpendingInput) {
  if (!access.user?.isOwner) throw new SplitError(403, 'Only the owner has personal spending.');
  const o = await openGroup(access, groupId);
  const e = o.loaded.expenses.find(x => x.id === expenseId);
  if (!e) throw new SplitError(404, 'Expense not found.');
  const x = toExpense(e);
  await syncSpending({ id: x.id, description: x.description, amount: x.amount, date: x.date, paidBy: x.paidBy, shares: x.shares, transactionId: e.transaction_id }, o.members, true, spending);
  return { ok: true };
}

/**
 * Keeps the owner's personal `transactions` row in step with a group expense.
 * my_share is the owner's share, so KPIs/budgets only ever count what's really theirs.
 * Creates a row only when `spending` (category etc.) is given; updates an existing one always, and deletes
 * it (when the owner drops out of the expense) only if the owner made the edit.
 */
async function syncSpending(
  e: { id: string; description: string; amount: number; date: string; paidBy: string; shares: Record<string, number>; transactionId: string | null },
  members: MemberRow[],
  byOwner: boolean,
  spending?: SpendingInput,
) {
  // The owner's seat: flagged when the owner made the group, or matched by email when a friend added them.
  const owner = active(members).find(m => m.is_owner) ?? active(members).find(m => isOwnerEmail(m.email));
  const { involved, amount, myShare } = ownerSpending(e.amount, e.paidBy, e.shares, owner?.id);
  const now = nowIso();
  const money = { amount, my_share: myShare, description: e.description, date: e.date, is_split: true, updated_at: now };
  const extra = spending ? { category_id: spending.categoryId, payment_method_id: spending.paymentMethodId, expense_type: spending.expenseType } : {};

  if (e.transactionId) {
    if (!involved) {
      await must(db().from('split_expenses').update({ transaction_id: null }).eq('id', e.id));
      // A friend's edit never deletes the owner's personal data; the owner can remove it on Transactions.
      if (byOwner) await must(db().from('transactions').delete().eq('id', e.transactionId));
    } else {
      await must(db().from('transactions').update({ ...money, ...extra }).eq('id', e.transactionId));
    }
    return;
  }
  if (!spending || !involved) return;
  const txId = cuid();
  await must(db().from('transactions').insert({ id: txId, type: 'expense', ...money, ...extra, created_at: now }));
  await must(db().from('split_expenses').update({ transaction_id: txId }).eq('id', e.id));
}

// ---------- settlements ----------

export async function settle(access: Access, input: { groupId: string; from: string; to: string; amount: number; date: string; note?: string; asMember?: string | null }) {
  const o = await openGroup(access, input.groupId, input.asMember);
  if (!o.me) throw new SplitError(400, 'Pick who you are first.');
  requireActive(o.members, [input.from, input.to], 'That person');
  if (input.from === input.to) throw new SplitError(400, 'Pick two different people.');
  const id = cuid();
  await must(db().from('split_settlements').insert({
    id, group_id: input.groupId, from_member: input.from, to_member: input.to, amount: r2(input.amount),
    date: input.date, note: input.note || null, created_by: o.me.id, created_at: nowIso(),
  }));
  await must(db().from('split_groups').update({ updated_at: nowIso() }).eq('id', input.groupId));
  return { id };
}

export async function deleteSettlement(access: Access, groupId: string, settlementId: string) {
  const o = await openGroup(access, groupId);
  if (!o.loaded.settlements.some(s => s.id === settlementId)) throw new SplitError(404, 'Payment not found.');
  await must(db().from('split_settlements').delete().eq('id', settlementId).eq('group_id', groupId));
  return { ok: true };
}

/**
 * Owner/AI shortcut: record payments that clear what's open between me and one person (by personKey)
 * in every group we share — or, with transactionId, just their share of that one expense.
 */
export async function settleWithPerson(user: SessionUser, key: string, transactionId?: string) {
  const loaded = await loadGroups(await myGroupIds(user));
  let successCount = 0;
  for (const g of loaded.groups) {
    const { members, transfers } = ledgerOf(g.id, loaded);
    const me = pickMe({ user }, members);
    const person = active(members).find(m => personKey(m) === key);
    if (!me || !person) continue;
    let pay = transfers.filter(t => (t.from === me.id && t.to === person.id) || (t.from === person.id && t.to === me.id));
    if (transactionId) {
      const e = loaded.expenses.find(x => x.group_id === g.id && x.transaction_id === transactionId);
      const share = e ? sharesOf(e)[person.id] ?? 0 : 0;
      // Never more than they still owe me here, so a retry or a second call doesn't overpay.
      const stillOwed = transfers.find(t => t.from === person.id && t.to === me.id)?.amount ?? 0;
      const amount = Math.min(share, stillOwed);
      pay = e && e.paid_by === me.id && amount > 0 ? [{ from: person.id, to: me.id, amount }] : [];
    }
    for (const t of pay) {
      await must(db().from('split_settlements').insert({
        id: cuid(), group_id: g.id, from_member: t.from, to_member: t.to, amount: r2(t.amount),
        date: nowIso().slice(0, 10), note: 'Settled from chat', created_by: me.id, created_at: nowIso(),
      }));
      successCount++;
    }
  }
  return { successCount };
}

// ---------- voice & import ----------

/** "Say it": parse a sentence into a draft for this group (not saved — the client saves or reviews it). */
export async function parseVoice(access: Access, input: { groupId: string; text: string; asMember?: string | null; today: string }) {
  const o = await openGroup(access, input.groupId, input.asMember);
  if (!o.me) throw new SplitError(400, 'Pick who you are first.');
  const members = active(o.members).map(m => ({ id: m.id, name: m.name }));
  try {
    return await parseVoiceDraft(input.text, members, { id: o.me.id, name: o.me.name }, input.today);
  } catch (e) {
    throw new SplitError(502, (e as Error).message.includes('resting') ? (e as Error).message : "Couldn't understand that. Try again or type it.");
  }
}

/** Creates a group from a Splitwise group export. `meIndex` is the caller's column. */
export async function importSplitwise(user: SessionUser, input: { csv: string; groupName: string; meIndex: number; emails?: { index: number; email: string }[] }) {
  let parsed;
  try { parsed = parseSplitwise(input.csv); } catch (e) { throw new SplitError(400, (e as Error).message); }
  if (input.meIndex < 0 || input.meIndex >= parsed.members.length) throw new SplitError(400, 'Pick which column is you.');
  if (parsed.currency !== 'INR') throw new SplitError(400, `This group is in ${parsed.currency}. Only INR (₹) groups can be imported.`);
  const ledger = splitwiseToLedger(parsed);
  if (ledger.expenses.length + ledger.settlements.length === 0) throw new SplitError(400, 'No expenses found in that file.');

  const groupId = cuid();
  const now = nowIso();
  const emailOf = new Map((input.emails ?? []).map(e => [e.index, e.email.trim().toLowerCase()]));
  const memberIds = parsed.members.map(() => cuid());
  const me = memberIds[input.meIndex];
  try {
    await must(db().from('split_groups').insert({ id: groupId, name: input.groupName, emoji: '🧳', kind: 'other', created_at: now, updated_at: now }));
    await must(db().from('split_members').insert(importMemberRows(parsed.members, input.meIndex, user, groupId, memberIds, emailOf, now)));

    const expenseRows = ledger.expenses.map(e => {
      const shares = Object.fromEntries(Object.entries(e.shares).map(([i, v]) => [memberIds[Number(i)], v]));
      return {
        row: {
          id: cuid(), group_id: groupId, description: e.description.slice(0, 120), amount: e.amount, date: e.date,
          emoji: emojiFor(`${e.description} ${e.category}`), method: 'exact', paid_by: memberIds[e.paidBy], created_by: me,
          meta: { imported: 'splitwise', participants: Object.keys(shares), values: shares }, created_at: now, updated_at: now,
        },
        shares,
      };
    });
    for (let i = 0; i < expenseRows.length; i += 500) {
      const chunk = expenseRows.slice(i, i + 500);
      await must(db().from('split_expenses').insert(chunk.map(c => c.row)));
      await must(db().from('split_expense_shares').insert(chunk.flatMap(c => Object.entries(c.shares).map(([member_id, amount]) => ({ expense_id: c.row.id, member_id, amount })))));
    }
    for (let i = 0; i < ledger.settlements.length; i += 500) {
      await must(db().from('split_settlements').insert(ledger.settlements.slice(i, i + 500).map(s => ({
        id: cuid(), group_id: groupId, from_member: memberIds[s.from], to_member: memberIds[s.to], amount: s.amount,
        date: s.date, note: s.note.slice(0, 200), created_by: me, created_at: now,
      }))));
    }
  } catch (e) {
    await db().from('split_groups').delete().eq('id', groupId); // no half-imported groups
    throw e;
  }
  return { groupId, expenses: ledger.expenses.length, settlements: ledger.settlements.length, skipped: ledger.skipped, balanceMismatch: ledger.balanceMismatch, currency: parsed.currency };
}

// ---------- receipts ----------

/** Attach a receipt photo/PDF to an expense (any member or link guest of the group). */
export async function attachReceipt(access: Access, input: { groupId: string; expenseId: string; dataUri: string }) {
  assertNotBridged(input.expenseId);
  const o = await openGroup(access, input.groupId);
  const e = o.loaded.expenses.find(x => x.id === input.expenseId);
  if (!e) throw new SplitError(404, 'Expense not found.');
  const file = decodeDataUri(input.dataUri);
  if (!file) throw new SplitError(400, 'Use a JPG, PNG, WEBP or PDF under 3 MB.');
  const path = await storeReceipt(input.groupId, input.expenseId, file);
  // Compare-and-set on updated_at so an edit saved during the upload isn't overwritten by a stale meta.
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = (await must<any[]>(db().from('split_expenses').select('meta, updated_at').eq('id', e.id).limit(1)))[0];
    if (!cur) { await removeReceipt(path); throw new SplitError(404, 'Expense not found.'); }
    const { data, error } = await db().from('split_expenses')
      .update({ meta: { ...(cur.meta ?? {}), receipt: path }, updated_at: nowIso() })
      .eq('id', e.id).eq('updated_at', cur.updated_at).select('id');
    if (error) { await removeReceipt(path); throw new Error(error.message); }
    if (data?.length) {
      if (cur.meta?.receipt && cur.meta.receipt !== path) await removeReceipt(cur.meta.receipt);
      return { ok: true };
    }
  }
  await removeReceipt(path);
  throw new SplitError(409, 'The expense changed while the photo uploaded. Try again.');
}

/** Short-lived link to view an expense's receipt; only for people who can see the group. */
export async function receiptUrl(access: Access, groupId: string, expenseId: string) {
  const o = await openGroup(access, groupId);
  const e = o.loaded.expenses.find(x => x.id === expenseId);
  if (!e?.meta?.receipt) throw new SplitError(404, 'No receipt on this expense.');
  const url = await signedReceiptUrl(e.meta.receipt);
  if (!url) throw new SplitError(404, 'Receipt file is missing.');
  return { url, isPdf: String(e.meta.receipt).endsWith('.pdf') };
}

/** Luna reads the receipt into line items (optionally "who had what" from text) — a draft, not saved. */
export async function scanReceipt(access: Access, input: { groupId: string; dataUri: string; text?: string; asMember?: string | null; today: string }) {
  const o = await openGroup(access, input.groupId, input.asMember);
  if (!o.me) throw new SplitError(400, 'Pick who you are first.');
  if (!decodeDataUri(input.dataUri)) throw new SplitError(400, 'Use a JPG, PNG, WEBP or PDF under 3 MB.');
  try {
    return await scanReceiptDraft(input.dataUri, active(o.members).map(m => ({ id: m.id, name: m.name })), o.me.name, input.text ?? '', input.today);
  } catch (e) {
    const msg = (e as Error).message;
    throw new SplitError(502, msg.includes('resting') ? msg : "Couldn't read that receipt. Try a sharper, flatter photo.");
  }
}

// ---------- one person, across groups ----------

export interface PersonItem {
  kind: 'expense' | 'settlement';
  id: string;
  groupId: string;
  groupName: string;
  groupEmoji: string | null;
  date: string;
  createdAt: string;
  title: string;
  emoji: string | null;
  amount: number;
  paidByName: string;
  theirShare: number;
  myShare: number;
  /** + they owe me more / paid me back less; − I owe them more */
  impact: number;
}

/** Everything between me and one person (by personKey) in every group we share, newest first. */
export async function getPerson(user: SessionUser, key: string) {
  const loaded = await loadGroups(await myGroupIds(user));
  const items: PersonItem[] = [];
  const groups: { groupId: string; groupName: string; groupEmoji: string | null; net: number }[] = [];
  let name = '';
  for (const g of loaded.groups) {
    const { members, expenses, settlements, transfers } = ledgerOf(g.id, loaded);
    const me = pickMe({ user }, members);
    const them = active(members).find(m => personKey(m) === key); // same seats as the People tab
    if (!me || !them || me.id === them.id) continue;
    name = them.name;
    const net = r2(transfers.reduce((a, t) => a + (t.from === them.id && t.to === me.id ? t.amount : t.from === me.id && t.to === them.id ? -t.amount : 0), 0));
    groups.push({ groupId: g.id, groupName: g.name, groupEmoji: g.emoji, net });
    const nameOf = (id: string) => (id === me.id ? 'You' : members.find(m => m.id === id)?.name ?? 'Someone');
    for (const e of expenses) {
      const theirs = e.shares[them.id] ?? 0, mine = e.shares[me.id] ?? 0;
      const themIn = e.paidBy === them.id || theirs > 0, meIn = e.paidBy === me.id || mine > 0;
      if (!themIn || !meIn) continue; // only what the two of us shared
      const impact = e.paidBy === me.id ? theirs : e.paidBy === them.id ? -mine : 0;
      items.push({ kind: 'expense', id: e.id, groupId: g.id, groupName: g.name, groupEmoji: g.emoji, date: e.date, createdAt: e.createdAt,
        title: e.description, emoji: e.emoji, amount: e.amount, paidByName: nameOf(e.paidBy), theirShare: theirs, myShare: mine, impact: r2(impact) });
    }
    for (const s of settlements) {
      const between = (s.from === them.id && s.to === me.id) || (s.from === me.id && s.to === them.id);
      if (!between) continue;
      items.push({ kind: 'settlement', id: s.id, groupId: g.id, groupName: g.name, groupEmoji: g.emoji, date: s.date, createdAt: s.createdAt,
        title: `${nameOf(s.from)} paid ${nameOf(s.to)}`, emoji: '💸', amount: s.amount, paidByName: nameOf(s.from), theirShare: 0, myShare: 0,
        impact: s.from === them.id ? -s.amount : s.amount });
    }
  }
  if (!name) throw new SplitError(404, 'Person not found.');
  items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return { key, name, net: r2(groups.reduce((a, g) => a + g.net, 0)), groups, items };
}
