// Server-only: the read functions the browser may call through /api/read.
// Reads go through a route instead of server actions because Next.js sends server
// actions one at a time, so a page's ten loads would queue behind each other.
import { getTransactions, getTransactionsInRange, queryTransactions, getCategories, getPaymentMethods } from '@/lib/actions/transactions';
import { getBudgets } from '@/lib/actions/budgets';
import { getGoals } from '@/lib/actions/goals';
import { getSplitUsers, getSplitBalances, getSplitTransactions } from '@/lib/actions/splits';
import { getPortfolioDashboardData } from '@/lib/actions/portfolio';
import { getMonthlyRollups, getTransactionYears, getCategoryBreakdown } from '@/lib/actions/analytics';
import { getPendingCount, getPendingTransactions } from '@/lib/actions/pending';
import { getRecurringRules } from '@/lib/actions/recurring';
import { getUsageReport } from '@/lib/usage-report';
import { listChats, listMemoryFacts } from '@/lib/chat-store';

export const READS = {
  getTransactions, getTransactionsInRange, queryTransactions, getCategories, getPaymentMethods,
  getBudgets, getGoals, getSplitUsers, getSplitBalances, getSplitTransactions, getPortfolioDashboardData,
  getMonthlyRollups, getTransactionYears, getCategoryBreakdown, getPendingCount, getPendingTransactions,
  getRecurringRules, listChats, listMemoryFacts, getUsageReport,
};
export type Reads = typeof READS;

// JSON that keeps Dates: { "$d": "<iso>" } on the wire.
export function encodeWithDates(value: unknown): string {
  return JSON.stringify(value, function (this: any, key: string, v: unknown) {
    const raw = this[key];
    if (raw instanceof Date) return { $d: isNaN(raw.getTime()) ? null : raw.toISOString() };
    return v;
  });
}
