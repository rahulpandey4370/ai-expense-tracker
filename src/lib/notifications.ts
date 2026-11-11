// What to notify about, and when. Server-only (uses the service-role client).
import { getSupabase } from '@/lib/supabase';
import { getAppCalendarDayString } from '@/lib/date-utils';
import { sendPush, sendPushOnce } from '@/lib/push';

const THRESHOLDS = [100, 80, 50]; // highest first: one alert per crossing, never three at once
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function todayIST(): string {
  return getAppCalendarDayString(new Date())!;
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type ExpenseRow = { net_amount: number; category_id: string | null; category_name: string | null; expense_type: string | null; date: string };

async function expensesBetween(startYmd: string, endYmd: string): Promise<ExpenseRow[]> {
  const rows: ExpenseRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from('transactions_expanded')
      .select('net_amount, category_id, category_name, expense_type, date')
      .eq('type', 'expense')
      .gte('date', startYmd)
      .lte('date', endYmd)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`Could not read expenses: ${error.message}`);
    rows.push(...((data ?? []) as ExpenseRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function incomeBetween(startYmd: string, endYmd: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from('transactions')
    .select('net_amount')
    .eq('type', 'income')
    .gte('date', startYmd)
    .lte('date', endYmd);
  if (error) throw new Error(`Could not read income: ${error.message}`);
  return (data ?? []).reduce((s, r) => s + Number(r.net_amount), 0);
}

const sum = (rows: ExpenseRow[]) => rows.reduce((s, r) => s + Number(r.net_amount), 0);

/**
 * Budget alerts at 50/80/100% of each monthly budget. Same rule as the
 * dashboard's budget card (category or need/want/investment, net of splits).
 * Safe to call often: each threshold alerts once per budget per month.
 */
export async function checkBudgetAlerts(): Promise<number> {
  const today = todayIST();
  const month = today.slice(0, 7);
  const { data: budgets, error } = await getSupabase().from('budgets').select('id, name, amount, type, target_id');
  if (error) throw new Error(`Could not read budgets: ${error.message}`);
  if (!budgets?.length) return 0;

  const expenses = await expensesBetween(`${month}-01`, today);
  let sent = 0;
  for (const b of budgets) {
    if (!(b.amount > 0)) continue;
    const spent = sum(expenses.filter(e => (b.type === 'category' ? e.category_id : e.expense_type) === b.target_id));
    const pct = (spent / b.amount) * 100;
    const crossed = THRESHOLDS.find(t => pct >= t);
    if (!crossed) continue;
    const left = b.amount - spent;
    const ok = await sendPushOnce(`budget:${b.id}:${month}:${crossed}`, {
      title: crossed >= 100 ? `🚨 ${b.name} budget exceeded` : `⚠️ ${b.name} budget at ${Math.floor(pct)}%`,
      body: crossed >= 100
        ? `${inr(spent)} spent of ${inr(b.amount)} this month, ${inr(-left)} over.`
        : `${inr(spent)} of ${inr(b.amount)} used, ${inr(left)} left for the rest of the month.`,
      url: '/',
      tag: `budget-${b.id}`,
    });
    if (ok) sent++;
  }
  return sent;
}

/** The 9 PM notifications: today's summary, tomorrow's bills, last month's recap on the 1st. */
export async function sendDailyNotifications(): Promise<{ sent: string[] }> {
  const sent: string[] = [];
  const today = todayIST();
  const month = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));

  // 1. Daily summary
  const monthExpenses = await expensesBetween(`${month}-01`, today);
  const todays = monthExpenses.filter(e => e.date === today);
  const todayTotal = sum(todays);
  const monthTotal = sum(monthExpenses);
  const byCategory = new Map<string, number>();
  todays.forEach(e => byCategory.set(e.category_name ?? 'Other', (byCategory.get(e.category_name ?? 'Other') ?? 0) + Number(e.net_amount)));
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${inr(v)}`).join(', ');

  const { count: pendingCount } = await getSupabase()
    .from('pending_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  const lines = [
    todays.length
      ? `Spent ${inr(todayTotal)} across ${todays.length} transaction${todays.length > 1 ? 's' : ''}: ${top}.`
      : 'No spending logged today.',
    `Month so far: ${inr(monthTotal)} (${inr(monthTotal / dayOfMonth)}/day avg).`,
  ];
  if (pendingCount) lines.push(`📩 ${pendingCount} SMS transaction${pendingCount > 1 ? 's' : ''} waiting for review.`);
  await sendPush({
    title: todays.length ? `🌙 Today: ${inr(todayTotal)} spent` : '🌙 Today: nothing spent',
    body: lines.join(' '),
    url: pendingCount ? '/pending' : '/transactions',
    tag: 'daily-summary',
  });
  sent.push('daily-summary');

  // 2. Recurring bills due tomorrow (they auto-log, this is the heads-up)
  const tomorrow = addDays(today, 1);
  const tDay = Number(tomorrow.slice(8, 10));
  const isLastDay = addDays(tomorrow, 1).slice(8, 10) === '01';
  const { data: rules, error: rulesError } = await getSupabase()
    .from('recurring_rules')
    .select('description, amount, day_of_month, start_date, end_date')
    .eq('is_active', true)
    .eq('type', 'expense');
  if (rulesError) throw new Error(`Could not read recurring rules: ${rulesError.message}`);
  const dueTomorrow = (rules ?? []).filter(r =>
    (r.day_of_month === tDay || (isLastDay && r.day_of_month > tDay)) && // 31st rules fall on the last day
    r.start_date <= tomorrow && (!r.end_date || r.end_date >= tomorrow),
  );
  if (dueTomorrow.length) {
    const total = dueTomorrow.reduce((s, r) => s + Number(r.amount), 0);
    await sendPush({
      title: `📅 Due tomorrow: ${inr(total)}`,
      body: dueTomorrow.map(r => `${r.description} ${inr(Number(r.amount))}`).join(', '),
      url: '/recurring',
      tag: 'bills-tomorrow',
    });
    sent.push('bills-tomorrow');
  }

  // 3. Last month's recap on the 1st
  if (dayOfMonth === 1) {
    const lastMonthEnd = addDays(today, -1);
    const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
    const [spent, income] = await Promise.all([
      expensesBetween(lastMonthStart, lastMonthEnd).then(sum),
      incomeBetween(lastMonthStart, lastMonthEnd),
    ]);
    const label = new Date(`${lastMonthStart}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' });
    const saved = income > 0 ? Math.round(((income - spent) / income) * 100) : null;
    await sendPush({
      title: `📊 ${label} recap`,
      body: `Spent ${inr(spent)}, earned ${inr(income)}${saved !== null ? `, saved ${saved}%` : ''}.`,
      url: '/reports',
      tag: 'monthly-recap',
    });
    sent.push('monthly-recap');
  }

  // 4. Budget alerts missed during the day (e.g. recurring auto-logs)
  if (await checkBudgetAlerts()) sent.push('budget-alerts');

  return { sent };
}
