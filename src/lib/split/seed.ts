// What the main app knows when someone asks to split (form, AI entry, SMS, chat) → a draft for one group.
import type { ExpenseMeta, GroupDetail, SplitMethod } from './types';

export interface SplitSeed {
  amount?: number;
  description?: string;
  date?: string;
  groupHint?: string;
  participantNames?: string[];
  /** custom amounts by name */
  amountsByName?: Record<string, number>;
  paidByName?: string;
  mode?: 'equally' | 'custom' | 'not_mine' | 'shares';
  /** Free text to parse against the chosen group (an SMS note like "split with Asha in Goa trip"). */
  instruction?: string;
  receiptDataUri?: string;
  /** My own share when it's known (an old Quick split); 0 = I'm not in it. */
  myShare?: number;
}

export interface SeedDraft {
  description: string; amount: number | null; date: string | null; paidBy: string; method: SplitMethod; meta: ExpenseMeta;
  said?: string; receiptDataUri?: string;
}

const norm = (s: string) => s.trim().toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Loose name match: full name, first name, or startsWith either way. */
export function findMember(d: GroupDetail, name?: string) {
  if (!name) return undefined;
  const n = norm(name);
  const active = d.members.filter(m => !m.removed);
  return active.find(m => norm(m.name) === n)
    ?? active.find(m => norm(m.name).split(' ')[0] === n.split(' ')[0])
    ?? active.find(m => norm(m.name).startsWith(n) || n.startsWith(norm(m.name)));
}

/** Seed → draft for a specific group (names resolved to that group's members). */
export function draftFor(d: GroupDetail, seed: SplitSeed, today: string): SeedDraft {
  const me = d.meMemberId ?? d.members[0]?.id ?? '';
  const named = (seed.participantNames ?? []).map(n => findMember(d, n)?.id).filter((x): x is string => !!x);
  const payer = findMember(d, seed.paidByName)?.id ?? me;
  const all = d.members.filter(m => !m.removed).map(m => m.id);
  const base = { description: seed.description ?? '', amount: seed.amount ?? null, date: seed.date ?? today, paidBy: payer, said: seed.instruction, receiptDataUri: seed.receiptDataUri };
  if (seed.mode === 'not_mine' && named[0]) return { ...base, method: 'cover', meta: { participants: [named[0]], coveredBy: named[0] } };
  const participants = named.length ? [...new Set([me, ...named])] : all;
  if (seed.mode === 'custom' && seed.amountsByName) {
    const values: Record<string, number> = {};
    for (const [n, v] of Object.entries(seed.amountsByName)) { const id = findMember(d, n)?.id; if (id) values[id] = v; }
    if (seed.myShare != null) {
      if (seed.myShare > 0) values[me] = r2(seed.myShare);
    } else if (seed.amount && !values[me] && payer === me) {
      values[me] = Math.max(0, r2(seed.amount - sum(values)));
    }
    // Someone else paid: whatever isn't anyone's recorded share is theirs.
    if (seed.amount && payer !== me) {
      const rest = r2(seed.amount - sum(values));
      if (rest > 0.005) values[payer] = r2((values[payer] ?? 0) + rest);
    }
    const parts = seed.myShare != null ? Object.keys(values) : [...new Set([...participants, ...Object.keys(values)])];
    return { ...base, method: 'exact', meta: { participants: parts, values } };
  }
  return { ...base, method: 'equal', meta: { participants } };
}
