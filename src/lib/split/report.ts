// Numbers for split reports (group or person, any date range). Pure — the PDF only draws them.
import { computeBalances, simplifyDebts } from './math';
import type { GroupDetail } from './types';
import type { PersonItem } from './service';

const r2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

/** First and last day of a YYYY-MM month. */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

export function groupReportData(d: GroupDetail, from: string, to: string) {
  const me = d.meMemberId;
  const byDate = <T extends { date: string; createdAt: string }>(a: T, b: T) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  const expenses = d.expenses.filter(e => inRange(e.date, from, to)).sort(byDate);
  const settlements = d.settlements.filter(x => inRange(x.date, from, to)).sort(byDate);

  const people = d.members.filter(m => !m.removed || expenses.some(e => e.paidBy === m.id || e.shares[m.id])).map(m => {
    const paid = r2(expenses.filter(e => e.paidBy === m.id).reduce((a, e) => a + e.amount, 0));
    const share = r2(expenses.reduce((a, e) => a + (e.shares[m.id] ?? 0), 0));
    const sent = settlements.filter(x => x.from === m.id).reduce((a, x) => a + x.amount, 0);
    const got = settlements.filter(x => x.to === m.id).reduce((a, x) => a + x.amount, 0);
    return { id: m.id, name: m.id === me ? 'You' : m.name, paid, share, net: r2(paid - share + sent - got) };
  });

  // Who owes whom on the last day of the period (everything up to then, not just this period).
  const upTo = (x: { date: string }) => x.date <= to;
  const balances = computeBalances(d.members.map(m => m.id),
    d.expenses.filter(upTo).map(e => ({ paidBy: e.paidBy, shares: e.shares })),
    d.settlements.filter(upTo));
  const transfers = simplifyDebts(balances);

  return {
    expenses, settlements, people, transfers,
    totalSpent: r2(expenses.reduce((a, e) => a + e.amount, 0)),
    myShare: me ? r2(expenses.reduce((a, e) => a + (e.shares[me] ?? 0), 0)) : 0,
    myPaid: me ? r2(expenses.filter(e => e.paidBy === me).reduce((a, e) => a + e.amount, 0)) : 0,
    myBalanceAtEnd: me ? r2(balances[me] ?? 0) : 0,
  };
}

export interface PersonData { key: string; name: string; net: number; groups: { groupId: string; groupName: string; groupEmoji: string | null; net: number }[]; items: PersonItem[] }

export function personReportData(p: PersonData, from: string, to: string) {
  const items = p.items.filter(i => inRange(i.date, from, to));
  return {
    items,
    periodNet: r2(items.reduce((a, i) => a + i.impact, 0)),
    sharedSpend: r2(items.filter(i => i.kind === 'expense').reduce((a, i) => a + i.amount, 0)),
  };
}
