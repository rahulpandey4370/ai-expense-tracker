// Totals for the finance PDF, using the same rules as the AI report (src/lib/actions/reports.ts):
// investment (by type or category) first, then want, then need, else "other". Amounts are my share.
import type { AppTransaction } from '@/lib/types';
import { netAmount } from '@/lib/split-utils';
import { investmentCategoryNames } from '@/lib/finance-constants';
import { getCalendarDateParts } from '@/lib/date-utils';

const r2 = (n: number) => Math.round(n * 100) / 100;
const INVEST = new Set<string>(investmentCategoryNames);
const kindOf = (t: AppTransaction) =>
  t.expenseType === 'investment' || (t.expenseType as string) === 'investment_expense' || (t.category?.name && INVEST.has(t.category.name)) ? 'invested'
  : t.expenseType === 'want' ? 'wants' : t.expenseType === 'need' ? 'needs' : 'other';

const ranked = (m: Map<string, number>) => [...m.entries()].map(([name, v]) => ({ name, value: r2(v) })).filter(c => c.value > 0).sort((a, b) => b.value - a.value);

export function financeNumbers(txs: AppTransaction[]) {
  const income = r2(txs.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0));
  const sum = { needs: 0, wants: 0, invested: 0, other: 0 };
  const byCat = new Map<string, number>(), byPlace = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    const v = netAmount(t), k = kindOf(t);
    sum[k] += v;
    const cat = t.category?.name ?? t.source ?? 'Uncategorised'; // same fallback as the Reports screen
    byCat.set(cat, (byCat.get(cat) ?? 0) + v);
    if (k !== 'invested') { const p = (t.description ?? '').split(':')[0].trim() || 'Unnamed'; byPlace.set(p, (byPlace.get(p) ?? 0) + v); }
  }
  const [needs, wants, invested, other] = [sum.needs, sum.wants, sum.invested, sum.other].map(r2);
  const spending = r2(needs + wants + other);
  const saved = r2(income - spending - invested);
  return { income, spending, invested, saved, needs, wants, other, categories: ranked(byCat), places: ranked(byPlace).slice(0, 8),
    rate: income > 0 ? Math.round((saved / income) * 1000) / 10 : null };
}

/** Months (0–11) that have transactions, in calendar order, using the app's IST calendar dates. */
export function financeByMonth(txs: AppTransaction[]) {
  const by = new Map<number, AppTransaction[]>();
  for (const t of txs) { const m = getCalendarDateParts(t.date)?.month; if (m != null) by.set(m, [...(by.get(m) ?? []), t]); }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([m, list]) => ({ m, count: list.length, ...financeNumbers(list) }));
}
