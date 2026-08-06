
'use server';

import { generateMonthlyFinancialReport } from "@/ai/flows/monthly-financial-report-flow";
import { generateYearlyFinancialReport } from "@/ai/flows/yearly-financial-report-flow";
import { type AIModel, type AITransactionForAnalysis, type MonthlySummary, type MonthlyFinancialReportInput, type MonthlyFinancialReportOutput, type YearlyFinancialReportInput, type YearlyFinancialReportOutput } from "@/lib/types";
import { getDefaultModelForTask } from "@/lib/task-models";
import { getCalendarDateParts } from "@/lib/date-utils";
import { getSupabase } from '@/lib/supabase';
import { investmentCategoryNames } from '@/lib/finance-constants';
import { createHash } from 'crypto';

/**
 * Stable fingerprint of the exact data a report was generated from.
 *
 * Sorted so an unrelated reordering doesn't force a regeneration, and built
 * from every field the report reasons about — change an amount, a category, a
 * date or a type and the hash moves, which correctly invalidates the cache.
 */
function fingerprintTransactions(txns: AITransactionForAnalysis[]): string {
  const rows = txns
    .map(t => [t.date, t.amount, t.type ?? '', t.categoryName ?? '', t.expenseType ?? '', t.description ?? ''].join('\u0001'))
    .sort();
  return createHash('sha1').update(`${rows.length}\u0002${rows.join('\u0003')}`).digest('hex');
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthlyReportId(year: number, month: number) {
  return `monthly:${year}-${String(month + 1).padStart(2, '0')}`;
}
function yearlyReportId(year: number) {
  return `yearly:${year}`;
}

const FULL_YEAR_TXN_THRESHOLD = 800;
const LARGEST_TXN_SAMPLE_SIZE = 200;

export type StoredMonthlyReport = MonthlyFinancialReportOutput & {
  /** Absent on reports cached before fingerprinting existed → regenerate once. */
  dataFingerprint?: string;
  generatedAt: string; // ISO
  transactionCount: number;
};

export async function loadStoredMonthlyReport(month: number, year: number): Promise<StoredMonthlyReport | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('report_cache').select('payload').eq('id', monthlyReportId(year, month)).maybeSingle();
  if (error) {
    console.warn("loadStoredMonthlyReport: failed to load report", { month, year, message: error.message });
    return null;
  }
  return (data?.payload as StoredMonthlyReport) ?? null;
}

async function saveStoredMonthlyReport(month: number, year: number, report: StoredMonthlyReport): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('report_cache').upsert({
    id: monthlyReportId(year, month),
    period_type: 'monthly',
    payload: report,
    created_at: report.generatedAt,
  });
  if (error) throw new Error(`Could not persist monthly report. Original error: ${error.message}`);
}

/**
 * Generates (or returns the cached) monthly AI report. Transactions must be
 * pre-filtered AND pre-converted on the client (in the user's local timezone)
 * so that a UTC-based server filter / date string doesn't shift IST-edge dates
 * into the wrong month. Mirrors the chatbot/insights pattern.
 */
export async function getMonthlyReport(
  month: number,
  year: number,
  relevantTransactions: AITransactionForAnalysis[],
  model: AIModel,
  options?: { forceRegenerate?: boolean }
): Promise<StoredMonthlyReport> {
  if (!options?.forceRegenerate) {
    const cached = await loadStoredMonthlyReport(month, year);
    // Count alone is not enough: editing an amount, category or date leaves the
    // count unchanged, so a stale report with the OLD numbers was served as if
    // it were current. Compare a fingerprint of the actual data instead.
    if (cached && cached.dataFingerprint === fingerprintTransactions(relevantTransactions)) return cached;
  }

  if (relevantTransactions.length === 0) {
    throw new Error(`No transactions found for ${monthNames[month]} ${year}.`);
  }

  const input: MonthlyFinancialReportInput = {
    monthName: monthNames[month],
    year,
    transactions: relevantTransactions,
    model: model || getDefaultModelForTask('monthly_report'),
  };

  const generated = await generateMonthlyFinancialReport(input);
  const stored: StoredMonthlyReport = {
    ...generated,
    generatedAt: new Date().toISOString(),
    transactionCount: relevantTransactions.length,
    dataFingerprint: fingerprintTransactions(relevantTransactions),
  };

  // Best-effort persist; don't fail the whole call if storage write fails.
  try {
    await saveStoredMonthlyReport(month, year, stored);
  } catch (err: any) {
    console.warn("getMonthlyReport: failed to persist report", { month, year, error: err?.message });
  }

  return stored;
}

export type StoredYearlyReport = YearlyFinancialReportOutput & {
  /** Absent on reports cached before fingerprinting existed → regenerate once. */
  dataFingerprint?: string;
  generatedAt: string;
  transactionCount: number;
};

export async function loadStoredYearlyReport(year: number): Promise<StoredYearlyReport | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('report_cache').select('payload').eq('id', yearlyReportId(year)).maybeSingle();
  if (error) {
    console.warn("loadStoredYearlyReport: failed to load report", { year, message: error.message });
    return null;
  }
  return (data?.payload as StoredYearlyReport) ?? null;
}

async function saveStoredYearlyReport(year: number, report: StoredYearlyReport): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('report_cache').upsert({
    id: yearlyReportId(year),
    period_type: 'yearly',
    payload: report,
    created_at: report.generatedAt,
  });
  if (error) throw new Error(`Could not persist yearly report. Original error: ${error.message}`);
}

/**
 * Sourced from the shared constants rather than re-listed here. This file used
 * to hard-code its own copy of the same eight names, which meant a category
 * added to the dashboard's definition of "investment" would silently not count
 * in the AI report — the report and the on-screen table would disagree.
 */
const INVESTMENT_CATEGORIES = new Set<string>(investmentCategoryNames);

function buildMonthlySummaries(txns: AITransactionForAnalysis[], year: number): MonthlySummary[] {
  const monthNamesArr = monthNames;
  const summaries: MonthlySummary[] = monthNamesArr.map((name, idx) => ({
    monthName: name, monthIndex: idx,
    totalIncome: 0, totalExpenses: 0,
    needs: 0, wants: 0, investments: 0, uncategorized: 0,
    transactionCount: 0,
    topCategories: [],
  }));

  const perMonthCategoryAgg: Record<number, Map<string, { amount: number; count: number }>> = {};
  for (let i = 0; i < 12; i++) perMonthCategoryAgg[i] = new Map();

  for (const t of txns) {
    const parts = getCalendarDateParts(t.date);
    if (!parts) continue;
    const m = parts.month;
    const s = summaries[m];
    s.transactionCount += 1;
    if (t.type === 'income') {
      s.totalIncome += t.amount;
    } else if (t.type === 'expense') {
      s.totalExpenses += t.amount;
      const isInvestment = t.expenseType === 'investment'
        || t.expenseType === 'investment_expense'
        || (t.categoryName ? INVESTMENT_CATEGORIES.has(t.categoryName) : false);
      if (isInvestment) s.investments += t.amount;
      else if (t.expenseType === 'want') s.wants += t.amount;
      else if (t.expenseType === 'need') s.needs += t.amount;
      // An expense with no expenseType is not a "need" — folding it in there
      // silently inflated needs and made the AI's needs/wants split disagree
      // with the rest of the app. Track it separately so the prompt can say so.
      else s.uncategorized += t.amount;
      if (t.categoryName) {
        const map = perMonthCategoryAgg[m];
        const existing = map.get(t.categoryName) || { amount: 0, count: 0 };
        existing.amount += t.amount;
        existing.count += 1;
        map.set(t.categoryName, existing);
      }
    }
  }

  for (let m = 0; m < 12; m++) {
    const top = Array.from(perMonthCategoryAgg[m].entries())
      .map(([name, v]) => ({ name, amount: v.amount, txnCount: v.count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    summaries[m].topCategories = top;
  }

  return summaries;
}

export async function getYearlyReport(
  year: number,
  yearTxns: AITransactionForAnalysis[],
  model: AIModel,
  options?: { forceRegenerate?: boolean }
): Promise<StoredYearlyReport> {
  if (!options?.forceRegenerate) {
    const cached = await loadStoredYearlyReport(year);
    if (cached && cached.dataFingerprint === fingerprintTransactions(yearTxns)) return cached;
  }

  if (yearTxns.length === 0) {
    throw new Error(`No transactions found for ${year}.`);
  }

  const monthlySummaries = buildMonthlySummaries(yearTxns, year);
  const isAggregated = yearTxns.length > FULL_YEAR_TXN_THRESHOLD;

  const input: YearlyFinancialReportInput = {
    year,
    monthlySummaries,
    totalTransactionCount: yearTxns.length,
    isAggregated,
    transactions: isAggregated ? undefined : yearTxns,
    largestTransactions: isAggregated
      ? [...yearTxns].sort((a, b) => b.amount - a.amount).slice(0, LARGEST_TXN_SAMPLE_SIZE)
      : undefined,
    model: model || getDefaultModelForTask('yearly_report'),
  };

  const generated = await generateYearlyFinancialReport(input);
  const stored: StoredYearlyReport = {
    ...generated,
    generatedAt: new Date().toISOString(),
    transactionCount: yearTxns.length,
    dataFingerprint: fingerprintTransactions(yearTxns),
  };

  try {
    await saveStoredYearlyReport(year, stored);
  } catch (err: any) {
    console.warn("getYearlyReport: failed to persist report", { year, error: err?.message });
  }

  return stored;
}
