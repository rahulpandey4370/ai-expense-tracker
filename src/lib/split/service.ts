// Group split ledger. Every exported op takes an Access and checks it via openGroup()
// (or myGroupIds() for the signed-in home view) before touching data.
import cuid from 'cuid';
import { randomBytes } from 'node:crypto';
import { getSupabase } from '@/lib/supabase';
import { isOwnerEmail, type SessionUser } from '@/lib/auth/roles';
import { resolveShares, computeBalances, simplifyDebts, type SplitMethod, type SplitItem } from './math';
import { canSeeGroup, pickMe, type Access, type MemberRow } from './access';
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

export async function getHome(user: SessionUser): Promise<HomeData> {
  const loaded = await loadGroups(await myGroupIds(user));
  const groups: GroupSummary[] = [];
  const people = new Map<string, PersonBalance>();
  const activity: ActivityItem[] = [];
  const unlinked: HomeData['unlinked'] = [];

  for (const g of loaded.groups) {
    const { members, expenses, settlements, balances, transfers } = ledgerOf(g.id, loaded);
    const me = pickMe({ user }, members);
    if (!me) continue;
    const name = (id: string) => members.find(m => m.id === id)?.name ?? 'Someone';
    const lastActivity = [g.updated_at, expenses[0]?.createdAt, settlements[0]?.createdAt].filter(Boolean).sort().at(-1)!;
    groups.push({
      ...toInfo(g), myBalance: balances[me.id] ?? 0, memberCount: active(members).length,
      totalSpent: r2(expenses.reduce((a, e) => a + e.amount, 0)), lastActivity,
    });

    for (const t of transfers) {
      if (t.from !== me.id && t.to !== me.id) continue;
      const other = members.find(m => m.id === (t.from === me.id ? t.to : t.from))!;
      const key = other.email ? other.email.toLowerCase() : `name:${other.name.trim().toLowerCase()}`;
      const net = t.to === me.id ? t.amount : -t.amount;
      const p = people.get(key) ?? { key, name: other.name, net: 0, groups: [] };
      p.net = r2(p.net + net);
      p.groups.push({ groupId: g.id, groupName: g.name, net });
      people.set(key, p);
    }

    for (const e of expenses) {
      const mine = e.shares[me.id] ?? 0;
      activity.push({
        id: e.id, groupId: g.id, groupName: g.name, kind: 'expense', title: e.description, who: name(e.paidBy),
        amount: e.amount, myImpact: e.paidBy === me.id ? r2(e.amount - mine) : -mine, at: e.createdAt,
      });
      if (user.isOwner && mine > 0 && !e.inMySpending) {
        unlinked.push({ groupId: g.id, groupName: g.name, expenseId: e.id, description: e.description, myShare: mine, date: e.date });
      }
    }
    for (const s of settlements) {
      activity.push({
        id: s.id, groupId: g.id, groupName: g.name, kind: 'settlement', title: `${name(s.from)} paid ${name(s.to)}`,
        who: name(s.from), amount: s.amount, myImpact: s.from === me.id ? -s.amount : s.to === me.id ? s.amount : 0, at: s.createdAt,
      });
    }
  }

  const peopleList = [...people.values()].filter(p => Math.abs(p.net) >= 0.01).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return {
    me: { name: user.name, email: user.email, isOwner: user.isOwner },
    totals: {
      owed: r2(peopleList.filter(p => p.net > 0).reduce((a, p) => a + p.net, 0)),
      owe: r2(-peopleList.filter(p => p.net < 0).reduce((a, p) => a + p.net, 0)),
    },
    groups: groups.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)),
    people: peopleList,
    activity: activity.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60),
    unlinked: unlinked.slice(0, 20),
  };
}

export async function getGroup(access: Access, groupId: string, asMember?: string | null): Promise<GroupDetail> {
  const o = await openGroup(access, groupId, asMember);
  const { members, expenses, settlements, balances, transfers } = ledgerOf(groupId, o.loaded);
  return {
    group: toInfo(o.group),
    members: members.map(toMember),
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
  await manage(access, groupId);
  await must(db().from('split_groups').delete().eq('id', groupId));
  return { ok: true };
}

export async function addMember(access: Access, groupId: string, input: { name: string; email?: string; upiId?: string }) {
  const o = await openGroup(access, groupId);
  const email = input.email?.trim().toLowerCase() || null;
  if (email && active(o.members).some(m => m.email === email)) throw new SplitError(400, 'That email is already in this group.');
  const id = cuid();
  await must(db().from('split_members').insert({ id, group_id: groupId, name: input.name, email, upi_id: input.upiId || null, created_at: nowIso() }));
  return { id };
}

export async function updateMember(access: Access, groupId: string, memberId: string, input: { name?: string; email?: string | null; upiId?: string | null }) {
  const o = await openGroup(access, groupId);
  requireActive(o.members, [memberId], 'That person');
  const target = o.members.find(m => m.id === memberId)!;
  // Changing who an account-holder's seat belongs to is a manage action.
  if (input.email !== undefined && (target.user_id || !o.canManage)) throw new SplitError(403, "You can't change this person's email.");
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
}

export async function saveExpense(access: Access, input: SaveExpenseInput) {
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

  await must(db().rpc('split_save_expense', {
    p_expense: {
      id, group_id: input.groupId, description: input.description, amount: input.amount, date: input.date,
      emoji: input.emoji ?? null, method: input.method, paid_by: input.paidBy,
      created_by: existing?.created_by ?? o.me.id, transaction_id: existing?.transaction_id ?? null,
      meta: { participants: input.participants, values: input.values, items: input.items, coveredBy: input.coveredBy },
    },
    p_shares: Object.entries(shares).map(([member_id, amount]) => ({ member_id, amount })),
  }));

  await syncSpending({
    id, description: input.description, amount: input.amount, date: input.date, paidBy: input.paidBy, shares,
    transactionId: existing?.transaction_id ?? null,
  }, o.members, access.user?.isOwner ? input.spending : undefined);
  return { id };
}

export async function deleteExpense(access: Access, groupId: string, expenseId: string) {
  const o = await openGroup(access, groupId);
  const e = o.loaded.expenses.find(x => x.id === expenseId);
  if (!e) throw new SplitError(404, 'Expense not found.');
  await must(db().from('split_expenses').delete().eq('id', expenseId).eq('group_id', groupId));
  if (e.transaction_id) await must(db().from('transactions').delete().eq('id', e.transaction_id));
  return { ok: true };
}

/** Owner one-tap: put my share of a friend-added expense into my personal spending. */
export async function linkToSpending(access: Access, groupId: string, expenseId: string, spending: SpendingInput) {
  if (!access.user?.isOwner) throw new SplitError(403, 'Only the owner has personal spending.');
  const o = await openGroup(access, groupId);
  const e = o.loaded.expenses.find(x => x.id === expenseId);
  if (!e) throw new SplitError(404, 'Expense not found.');
  const x = toExpense(e);
  await syncSpending({ id: x.id, description: x.description, amount: x.amount, date: x.date, paidBy: x.paidBy, shares: x.shares, transactionId: e.transaction_id }, o.members, spending);
  return { ok: true };
}

/**
 * Keeps the owner's personal `transactions` row in step with a group expense.
 * my_share is the owner's share, so KPIs/budgets only ever count what's really theirs.
 * Creates a row only when `spending` (category etc.) is given; updates or removes an existing one always.
 */
async function syncSpending(
  e: { id: string; description: string; amount: number; date: string; paidBy: string; shares: Record<string, number>; transactionId: string | null },
  members: MemberRow[],
  spending?: SpendingInput,
) {
  // The owner's seat: flagged when the owner made the group, or matched by email when a friend added them.
  const owner = active(members).find(m => m.is_owner) ?? active(members).find(m => isOwnerEmail(m.email));
  const myShare = owner ? e.shares[owner.id] ?? 0 : 0;
  const iPaid = !!owner && e.paidBy === owner.id;
  const involved = myShare > 0 || iPaid;
  const now = nowIso();
  const money = { amount: iPaid ? e.amount : myShare, my_share: myShare, description: e.description, date: e.date, is_split: true, updated_at: now };
  const extra = spending ? { category_id: spending.categoryId, payment_method_id: spending.paymentMethodId, expense_type: spending.expenseType } : {};

  if (e.transactionId) {
    if (!involved) {
      await must(db().from('split_expenses').update({ transaction_id: null }).eq('id', e.id));
      await must(db().from('transactions').delete().eq('id', e.transactionId));
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
