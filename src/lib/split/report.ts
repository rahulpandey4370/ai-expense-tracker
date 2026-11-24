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

const dayNum = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000;

/** The group's numbers for a period (default: all time). One source for the screen and the PDF. */
export function groupKpis(d: GroupDetail, from = '0000-01-01', to = '9999-12-31') {
  const r = groupReportData(d, from, to);
  const count = r.expenses.length;
  const dates = r.expenses.map(e => e.date).sort();
  const days = count ? dayNum(dates[count - 1]) - dayNum(dates[0]) + 1 : 0; // first to last day with spending
  const biggest = [...r.expenses].sort((a, b) => b.amount - a.amount)[0] ?? null;
  const top = [...r.people].filter(p => p.paid > 0).sort((a, b) => b.paid - a.paid)[0] ?? null;
  return {
    ...r, count,
    avgPerExpense: count ? r2(r.totalSpent / count) : 0,
    avgPerDay: days ? r2(r.totalSpent / days) : 0,
    biggest: biggest && { description: biggest.description, amount: biggest.amount, date: biggest.date },
    paymentsTotal: r2(r.settlements.reduce((a, x) => a + x.amount, 0)),
    topPayer: top && { name: top.name, paid: top.paid },
  };
}

/** Group spend per month with expenses, oldest first, the last `n`. */
export function groupByMonth(d: GroupDetail, n = 6): { month: string; total: number }[] {
  const m = new Map<string, number>();
  for (const e of d.expenses) m.set(e.date.slice(0, 7), (m.get(e.date.slice(0, 7)) ?? 0) + e.amount);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-n).map(([month, total]) => ({ month, total: r2(total) }));
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`; // matches the PDF's inr()

/** The report's Summary, in plain sentences: totals, each person, biggest, payments, who owes whom at the end date. */
export function groupSummary(d: GroupDetail, from: string, to: string): string[] {
  const k = groupKpis(d, from, to);
  const me = d.meMemberId;
  const name = (id: string) => (id === me ? 'you' : d.members.find(m => m.id === id)?.name ?? 'Someone');
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const lines: string[] = [];
  lines.push(k.count === 0 ? 'Nothing was spent in this period.'
    : `${rupees(k.totalSpent)} was spent across ${k.count} expense${k.count === 1 ? '' : 's'} (average ${rupees(k.avgPerExpense)}).`);
  for (const p of k.people) {
    if (p.paid <= 0 && p.share <= 0) continue;
    lines.push(p.id === me ? `You paid ${rupees(p.paid)}; your share was ${rupees(p.share)}.` : `${p.name} paid ${rupees(p.paid)}; their share was ${rupees(p.share)}.`);
  }
  if (k.biggest) lines.push(`The biggest expense was ${k.biggest.description} (${rupees(k.biggest.amount)}).`);
  if (k.paymentsTotal > 0) lines.push(`${rupees(k.paymentsTotal)} was paid back between people.`);
  if (k.transfers.length === 0) lines.push('Everyone is square.');
  for (const t of k.transfers) lines.push(`${cap(name(t.from))} ${t.from === me ? 'owe' : 'owes'} ${name(t.to)} ${rupees(t.amount)}.`);
  return lines;
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

/** True when the balance (from each group's simplified settle-up) isn't the plain total of the rows between the two of you. */
export const simplifiedDiffers = (p: Pick<PersonData, 'net' | 'items'>) =>
  Math.abs(p.items.reduce((a, i) => a + i.impact, 0) - p.net) >= 0.01;
