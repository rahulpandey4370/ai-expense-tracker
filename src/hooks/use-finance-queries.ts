"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TransactionQueryOptions } from '@/lib/actions/transactions';
import { read } from '@/lib/read-client';

// Centralized query keys so any mutation can invalidate precisely.
export const financeKeys = {
  all: ['finance'] as const,
  transactions: () => [...financeKeys.all, 'transactions'] as const,
  transactionsRange: (start: string, end: string) =>
    [...financeKeys.transactions(), 'range', start, end] as const,
  transactionsQuery: (opts: TransactionQueryOptions) =>
    [...financeKeys.transactions(), 'query', opts] as const,
  categories: () => [...financeKeys.all, 'categories'] as const,
  paymentMethods: () => [...financeKeys.all, 'paymentMethods'] as const,
  budgets: () => [...financeKeys.all, 'budgets'] as const,
  goals: () => [...financeKeys.all, 'goals'] as const,
  recentTransactions: (limit: number) => [...financeKeys.transactions(), 'recent', limit] as const,
  monthlyRollups: (year: number, invCats: string[], cbCats: string[]) =>
    [...financeKeys.all, 'rollups', year, invCats, cbCats] as const,
  transactionYears: () => [...financeKeys.all, 'years'] as const,
  categoryBreakdown: (start: string, end: string, type: string | null) =>
    [...financeKeys.all, 'categoryBreakdown', start, end, type] as const,
  splitUsers: () => [...financeKeys.all, 'splitUsers'] as const,
  splitTransactions: () => [...financeKeys.all, 'splitTransactions'] as const,
  splitBalances: () => [...financeKeys.all, 'splitBalances'] as const,
  portfolioDashboard: () => [...financeKeys.all, 'portfolioDashboard'] as const,
  pendingCount: () => [...financeKeys.all, 'pendingCount'] as const,
};

export function useTransactionsInRange(startYmd: string, endYmd: string, enabled = true) {
  return useQuery({
    queryKey: financeKeys.transactionsRange(startYmd, endYmd),
    queryFn: () => read('getTransactionsInRange', startYmd, endYmd),
    enabled,
  });
}

export function useTransactionsQuery(opts: TransactionQueryOptions) {
  return useQuery({
    queryKey: financeKeys.transactionsQuery(opts),
    queryFn: () => read('queryTransactions', opts),
    placeholderData: (prev) => prev, // keep prior page visible while the next loads
  });
}

export function useCategories() {
  return useQuery({ queryKey: financeKeys.categories(), queryFn: () => read('getCategories') });
}

export function usePaymentMethods() {
  return useQuery({ queryKey: financeKeys.paymentMethods(), queryFn: () => read('getPaymentMethods') });
}

export function useBudgets() {
  return useQuery({ queryKey: financeKeys.budgets(), queryFn: () => read('getBudgets') });
}

export function useGoals() {
  return useQuery({ queryKey: financeKeys.goals(), queryFn: () => read('getGoals') });
}

/** Most-recent N transactions (server-side ORDER BY date DESC LIMIT n). */
export function useRecentTransactions(limit: number) {
  return useQuery({
    queryKey: financeKeys.recentTransactions(limit),
    queryFn: () => read('getTransactions', { limit }),
  });
}

export function useMonthlyRollups(year: number, invCats?: string[], cbCats?: string[]) {
  return useQuery({
    queryKey: financeKeys.monthlyRollups(year, invCats ?? [], cbCats ?? []),
    queryFn: () => read('getMonthlyRollups', year, invCats, cbCats),
  });
}

export function useTransactionYears() {
  return useQuery({ queryKey: financeKeys.transactionYears(), queryFn: () => read('getTransactionYears') });
}

export function useCategoryBreakdown(startYmd: string, endYmd: string, type: 'income' | 'expense' | null = 'expense') {
  return useQuery({
    queryKey: financeKeys.categoryBreakdown(startYmd, endYmd, type),
    queryFn: () => read('getCategoryBreakdown', startYmd, endYmd, type),
  });
}

export function useSplitUsers() {
  return useQuery({ queryKey: financeKeys.splitUsers(), queryFn: () => read('getSplitUsers') });
}

export function useSplitTransactions(limit?: number) {
  return useQuery({ queryKey: financeKeys.splitTransactions(), queryFn: () => read('getSplitTransactions', { limit }) });
}

export function useSplitBalances() {
  return useQuery({ queryKey: financeKeys.splitBalances(), queryFn: () => read('getSplitBalances') });
}

export function usePortfolioDashboard() {
  return useQuery({ queryKey: financeKeys.portfolioDashboard(), queryFn: () => read('getPortfolioDashboardData') });
}

/** SMS waiting in the inbox. Refetches on focus: new SMS land while the app is in the background. */
export function usePendingCount(enabled = true) {
  return useQuery({ queryKey: financeKeys.pendingCount(), queryFn: () => read('getPendingCount'), enabled, refetchOnWindowFocus: true, refetchInterval: 60_000, staleTime: 15_000 });
}

/** Invalidate every finance query after a transaction add/edit/delete. */
export function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: financeKeys.all });
}
