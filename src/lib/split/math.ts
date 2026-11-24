// Pure split arithmetic. All math runs in integer paise so shares always sum to the amount.

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares' | 'items' | 'cover';

export interface SplitItem { name: string; amount: number; memberIds: string[] }

export interface ShareInput {
  participants: string[];
  /** exact: rupees · percent: 0-100 · shares: weights */
  values?: Record<string, number>;
  items?: SplitItem[];
  coveredBy?: string;
}

export interface Transfer { from: string; to: string; amount: number }

const toPaise = (n: number) => Math.round(n * 100);
const toRupees = (p: number) => p / 100;
const fmt = (p: number) => `₹${(p / 100).toFixed(2)}`;

/** Divides `totalPaise` by integer weights; leftover paise go to the first ids in order. */
function allocate(totalPaise: number, ids: string[], weights: number[]): Record<string, number> {
  const wsum = weights.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  if (ids.length === 0 || wsum <= 0) return out;
  let given = 0;
  ids.forEach((id, i) => {
    out[id] = Math.floor((totalPaise * weights[i]) / wsum);
    given += out[id];
  });
  for (let i = 0; given < totalPaise; i = (i + 1) % ids.length) {
    if (weights[i] > 0) { out[ids[i]] += 1; given += 1; }
  }
  return out;
}

function addInto(acc: Record<string, number>, part: Record<string, number>) {
  for (const [k, v] of Object.entries(part)) acc[k] = (acc[k] ?? 0) + v;
}

export function resolveShares(amount: number, method: SplitMethod, input: ShareInput): { shares: Record<string, number>; error?: string } {
  const total = toPaise(amount);
  const fail = (error: string) => ({ shares: {}, error });
  if (!(total > 0)) return fail('Enter an amount above zero.');
  const ids = [...new Set(input.participants)];
  const v = input.values ?? {};
  let paise: Record<string, number>;

  switch (method) {
    case 'cover': {
      if (!input.coveredBy) return fail('Pick who covers it.');
      paise = { [input.coveredBy]: total };
      break;
    }
    case 'items': {
      const items = (input.items ?? []).filter(i => toPaise(i.amount) > 0);
      if (items.length === 0) return fail('Add at least one item.');
      if (items.some(i => i.memberIds.length === 0)) return fail('Every item needs at least one person.');
      const itemsTotal = items.reduce((a, i) => a + toPaise(i.amount), 0);
      if (itemsTotal !== total) {
        const d = total - itemsTotal;
        return fail(d > 0 ? `${fmt(d)} left to assign` : `${fmt(-d)} over the total`);
      }
      paise = {};
      for (const it of items) addInto(paise, allocate(toPaise(it.amount), it.memberIds, it.memberIds.map(() => 1)));
      break;
    }
    case 'exact': {
      if (ids.length === 0) return fail('Pick at least one person.');
      paise = Object.fromEntries(ids.map(id => [id, toPaise(v[id] ?? 0)]));
      const d = total - Object.values(paise).reduce((a, b) => a + b, 0);
      if (d !== 0) return fail(d > 0 ? `${fmt(d)} left` : `${fmt(-d)} over`);
      break;
    }
    case 'percent': {
      if (ids.length === 0) return fail('Pick at least one person.');
      const bp = ids.map(id => Math.round((v[id] ?? 0) * 100)); // basis points
      const sumBp = bp.reduce((a, b) => a + b, 0);
      if (sumBp !== 10000) return fail(`Percentages add up to ${(sumBp / 100).toFixed(2)}%, not 100%`);
      paise = allocate(total, ids, bp);
      break;
    }
    case 'shares': {
      if (ids.length === 0) return fail('Pick at least one person.');
      const w = ids.map(id => Math.round((v[id] ?? 0) * 100));
      if (w.some(x => x < 0) || w.reduce((a, b) => a + b, 0) <= 0) return fail('Give at least one person a share.');
      paise = allocate(total, ids, w);
      break;
    }
    case 'equal':
    default: {
      if (ids.length === 0) return fail('Pick at least one person.');
      paise = allocate(total, ids, ids.map(() => 1));
    }
  }

  const shares: Record<string, number> = {};
  for (const [k, p] of Object.entries(paise)) if (p > 0) shares[k] = toRupees(p);
  return { shares };
}

/** Net balance per member: positive = others owe them. */
export function computeBalances(
  members: string[],
  expenses: { paidBy: string; shares: Record<string, number> }[],
  settlements: Transfer[],
): Record<string, number> {
  const p: Record<string, number> = Object.fromEntries(members.map(m => [m, 0]));
  const bump = (id: string, d: number) => { p[id] = (p[id] ?? 0) + d; };
  for (const e of expenses) {
    for (const [id, amt] of Object.entries(e.shares)) {
      bump(e.paidBy, toPaise(amt));
      bump(id, -toPaise(amt));
    }
  }
  for (const s of settlements) {
    bump(s.from, toPaise(s.amount));
    bump(s.to, -toPaise(s.amount));
  }
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, toRupees(v)]));
}

/** Fewest-ish transfers: repeatedly settle the largest debtor against the largest creditor. */
export function simplifyDebts(balances: Record<string, number>): Transfer[] {
  const cred = Object.entries(balances).map(([id, b]) => ({ id, p: toPaise(b) })).filter(x => x.p > 0);
  const debt = Object.entries(balances).map(([id, b]) => ({ id, p: -toPaise(b) })).filter(x => x.p > 0);
  const out: Transfer[] = [];
  while (cred.length && debt.length) {
    cred.sort((a, b) => b.p - a.p);
    debt.sort((a, b) => b.p - a.p);
    const c = cred[0], d = debt[0];
    const amt = Math.min(c.p, d.p);
    out.push({ from: d.id, to: c.id, amount: toRupees(amt) });
    c.p -= amt; d.p -= amt;
    if (c.p === 0) cred.shift();
    if (d.p === 0) debt.shift();
  }
  return out;
}

/**
 * The owner's personal-ledger numbers for a group expense: `myShare` is what counts as their
 * spend (transactions.my_share); `amount` is cash out — the whole bill if they paid, else their share.
 */
export function ownerSpending(total: number, paidBy: string, shares: Record<string, number>, ownerId?: string) {
  if (!ownerId) return { involved: false, amount: 0, myShare: 0 };
  const myShare = shares[ownerId] ?? 0;
  const iPaid = paidBy === ownerId;
  if (!iPaid && myShare <= 0) return { involved: false, amount: 0, myShare: 0 };
  return { involved: true, amount: iPaid ? total : myShare, myShare };
}
