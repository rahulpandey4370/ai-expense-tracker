// The hero card's typed lines, built only from real data (no example sentences).
import type { GroupDetail, HomeData } from './types';

const EMPTY = 'Tap here to log an expense';
const rs = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

export function homeLines(d: HomeData, today: string): string[] {
  const month = today.slice(0, 7);
  const lines: string[] = [];
  const spent = d.spentByMonth.find(m => m.month === month)?.amount ?? 0;
  if (spent >= 1) lines.push(`You spent ${rs(spent)} this month`);
  for (const p of [...d.people].filter(p => Math.abs(p.net) >= 1).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 2)) {
    lines.push(p.net > 0 ? `${first(p.name)} owes you ${rs(p.net)}` : `You owe ${first(p.name)} ${rs(-p.net)}`);
  }
  const biggest = d.activity.filter(a => a.kind === 'expense' && a.date.startsWith(month)).sort((a, b) => b.amount - a.amount)[0];
  if (biggest) lines.push(`Biggest this month: ${biggest.title}, ${rs(biggest.amount)}`);
  if (d.weekCount > 0) lines.push(`${d.weekCount} ${d.weekCount === 1 ? 'expense' : 'expenses'} logged this week`);
  return lines.length ? lines : [EMPTY];
}

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });

/** About one month of the group (the one on screen); null = the group has no expenses yet. */
export function groupLines(d: GroupDetail, month: string | null): string[] {
  const me = d.meMemberId;
  const inMonth = month ? d.expenses.filter(e => e.date.startsWith(month)) : [];
  if (!month || inMonth.length === 0) return [EMPTY];
  const mn = monthName(month);
  const lines: string[] = [];
  const total = inMonth.reduce((a, e) => a + e.amount, 0);
  if (total >= 1) lines.push(`${rs(total)} spent in ${mn}`);
  const mine = me ? inMonth.reduce((a, e) => a + (e.shares[me] ?? 0), 0) : 0;
  if (mine >= 1) lines.push(`Your share in ${mn}: ${rs(mine)}`);
  const biggest = [...inMonth].sort((a, b) => b.amount - a.amount)[0];
  lines.push(`Biggest in ${mn}: ${biggest.description}, ${rs(biggest.amount)}`);
  lines.push(`${inMonth.length} ${inMonth.length === 1 ? 'expense' : 'expenses'} in ${mn}`);
  return lines;
}
