'use server';

import { getSupabase } from '@/lib/supabase';
import { investmentCategoryNames, cashbackAndInterestAndDividendCategoryNames } from '@/lib/finance-constants';

export interface MonthlyRollup {
  monthIndex: number; // 0-11
  totalIncome: number;
  totalExpenses: number;
  needs: number;
  wants: number;
  investments: number;
  cashbackInterestDividends: number;
  transactionCount: number;
}

/**
 * 12 monthly rollup rows for a year, aggregated in Postgres. Used by the yearly
 * overview and to build report inputs without transferring a year of rows.
 */
export async function getTransactionYears(): Promise<number[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('transaction_years');
  if (error) {
    console.error('Supabase Error (getTransactionYears):', error.message);
    throw new Error(`Could not fetch transaction years. Original error: ${error.message}`);
  }
  return (data as any[]).map(r => Number(r.year));
}

/**
 * @param investmentCategories overrides the category-name list counted as
 *   investments (defaults to the shared finance-constants list). The yearly
 *   overview passes its own narrower list to preserve its exact totals.
 */
export async function getMonthlyRollups(
  year: number,
  investmentCategories: string[] = investmentCategoryNames,
  cashbackCategories: string[] = cashbackAndInterestAndDividendCategoryNames
): Promise<MonthlyRollup[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('monthly_rollups', {
    p_year: year,
    p_investment_categories: investmentCategories,
    p_cashback_categories: cashbackCategories,
  });
  if (error) {
    console.error('Supabase Error (getMonthlyRollups):', error.message);
    throw new Error(`Could not fetch monthly rollups. Original error: ${error.message}`);
  }
  return (data as any[]).map(r => ({
    monthIndex: Number(r.month_index),
    totalIncome: Number(r.total_income),
    totalExpenses: Number(r.total_expenses),
    needs: Number(r.needs),
    wants: Number(r.wants),
    investments: Number(r.investments),
    cashbackInterestDividends: Number(r.cashback_interest_dividends),
    transactionCount: Number(r.transaction_count),
  }));
}

export interface CategoryBreakdownRow {
  categoryName: string;
  total: number;
  transactionCount: number;
}

export async function getCategoryBreakdown(
  startYmd: string,
  endYmd: string,
  type: 'income' | 'expense' | null = 'expense'
): Promise<CategoryBreakdownRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('category_breakdown', {
    p_start: startYmd,
    p_end: endYmd,
    p_type: type,
  });
  if (error) {
    console.error('Supabase Error (getCategoryBreakdown):', error.message);
    throw new Error(`Could not fetch category breakdown. Original error: ${error.message}`);
  }
  return (data as any[]).map(r => ({
    categoryName: r.category_name,
    total: Number(r.total),
    transactionCount: Number(r.transaction_count),
  }));
}
