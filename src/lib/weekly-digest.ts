// The Sunday digest's words, kept pure so they can be tested. notifications.ts gathers the numbers.

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export type DigestExpense = { amount: number; category: string; description: string };
export type DigestBudget = { name: string; limit: number; spent: number };

export function weeklyDigest(input: {
  week: DigestExpense[];          // Monday to today (Sunday)
  lastWeek: DigestExpense[];      // the 7 days before
  priorFourWeeks: DigestExpense[];// the 28 days before this week, for "usual" per category
  budgets: DigestBudget[];        // month to date
}): { title: string; body: string } {
  const total = (xs: DigestExpense[]) => xs.reduce((s, x) => s + x.amount, 0);
  const spent = total(input.week);
  const before = total(input.lastWeek);
  const change = before > 0 ? Math.round(((spent - before) / before) * 100) : null;

  const lines = [
    `Spent ${inr(spent)} this week${change === null ? '.' : change === 0 ? ', same as last week.' : `, ${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than last week.`}`,
  ];

  const over = input.budgets.filter(b => b.limit > 0 && b.spent > b.limit);
  const near = input.budgets.filter(b => b.limit > 0 && b.spent <= b.limit && b.spent >= 0.8 * b.limit);
  if (input.budgets.length) {
    lines.push(over.length || near.length
      ? `Budgets: ${[over.length ? `${over.map(b => b.name).join(', ')} over` : '', near.length ? `${near.map(b => b.name).join(', ')} above 80%` : ''].filter(Boolean).join('; ')}.`
      : 'Budgets: all on track.');
  }

  // One thing worth noticing: the category furthest above its usual week, else the biggest expense.
  const byCat = (xs: DigestExpense[]) => xs.reduce((m, x) => m.set(x.category, (m.get(x.category) ?? 0) + x.amount), new Map<string, number>());
  const now = byCat(input.week);
  const usual = byCat(input.priorFourWeeks);
  const jump = [...now.entries()]
    .map(([cat, amt]) => ({ cat, amt, usual: (usual.get(cat) ?? 0) / 4 }))
    .filter(c => c.amt - c.usual >= 500 && c.amt >= 1.5 * c.usual)
    .sort((a, b) => (b.amt - b.usual) - (a.amt - a.usual))[0];
  const biggest = [...input.week].sort((a, b) => b.amount - a.amount)[0];
  if (jump) lines.push(`Worth a look: ${jump.cat} was ${inr(jump.amt)}, usually ${inr(jump.usual)} a week.`);
  else if (biggest) lines.push(`Biggest spend: ${biggest.description} ${inr(biggest.amount)}.`);

  return { title: `🗓️ Your week: ${inr(spent)} spent`, body: lines.join(' ') };
}
