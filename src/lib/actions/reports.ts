
'use server';

import { generateMonthlyFinancialReport, type MonthlyFinancialReportInput, type MonthlyFinancialReportOutput } from "@/ai/flows/monthly-financial-report-flow";
import { generateYearlyFinancialReport, type YearlyFinancialReportInput, type YearlyFinancialReportOutput } from "@/ai/flows/yearly-financial-report-flow";
import { AITransactionForAnalysisSchema, type AIModel, type AITransactionForAnalysis, type MonthlySummary } from "@/lib/types";
import { getTransactions } from "./transactions";
import { getCalendarDateString, isSameCalendarMonth, isSameCalendarYear, getCalendarDateParts } from "@/lib/date-utils";
import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const REPORTS_DIR = 'internal/data/monthly-reports/';
const YEARLY_REPORTS_DIR = 'internal/data/yearly-reports/';
function reportBlobPath(year: number, month: number) {
  return `${REPORTS_DIR}${year}-${String(month + 1).padStart(2, '0')}.json`;
}
function yearlyReportBlobPath(year: number) {
  return `${YEARLY_REPORTS_DIR}${year}.json`;
}

const FULL_YEAR_TXN_THRESHOLD = 800;
const LARGEST_TXN_SAMPLE_SIZE = 200;

let _blobClient: BlobContainerClient | undefined;
async function getBlobContainer(): Promise<BlobContainerClient> {
  if (_blobClient) return _blobClient;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!connectionString || !containerName) {
    throw new Error("Azure storage env vars missing for monthly reports.");
  }
  _blobClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  return _blobClient;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export type StoredMonthlyReport = MonthlyFinancialReportOutput & {
  generatedAt: string; // ISO
  transactionCount: number;
};

export async function loadStoredMonthlyReport(month: number, year: number): Promise<StoredMonthlyReport | null> {
  try {
    const client = await getBlobContainer();
    const blob = client.getBlobClient(reportBlobPath(year, month));
    const dl = await blob.download(0);
    if (!dl.readableStreamBody) return null;
    const text = await streamToString(dl.readableStreamBody);
    return JSON.parse(text) as StoredMonthlyReport;
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) return null;
    console.warn("loadStoredMonthlyReport: failed to load report", { month, year, message: error.message });
    return null;
  }
}

async function saveStoredMonthlyReport(month: number, year: number, report: StoredMonthlyReport): Promise<void> {
  const client = await getBlobContainer();
  const path = reportBlobPath(year, month);
  const block = client.getBlockBlobClient(path);
  const body = JSON.stringify(report, null, 2);
  // upload() overwrites by default — exactly the "replace on regenerate" behaviour we want.
  await block.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

/**
 * Returns the cached report for the month if one exists; otherwise generates
 * (and persists) a new one. Pass `forceRegenerate=true` to overwrite the stored
 * report with a freshly generated one.
 */
export async function getMonthlyReport(
  month: number,
  year: number,
  model: AIModel,
  options?: { forceRegenerate?: boolean }
): Promise<StoredMonthlyReport> {
  if (!options?.forceRegenerate) {
    const cached = await loadStoredMonthlyReport(month, year);
    if (cached) return cached;
  }

  const allTransactions = await getTransactions();
  const relevantTransactions = allTransactions
    .filter(t => isSameCalendarMonth(t.date, month, year))
    .map(t => {
      const validated = AITransactionForAnalysisSchema.safeParse({
        description: t.description,
        amount: t.amount,
        date: getCalendarDateString(t.date) || t.date.toISOString(),
        categoryName: t.category?.name,
        paymentMethodName: t.paymentMethod?.name,
        expenseType: t.expenseType,
        type: t.type,
        source: t.source,
      });
      return validated.success ? validated.data : null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  if (relevantTransactions.length === 0) {
    throw new Error(`No transactions found for ${monthNames[month]} ${year}.`);
  }

  const input: MonthlyFinancialReportInput = {
    monthName: monthNames[month],
    year,
    transactions: relevantTransactions,
    model: model || 'gpt-5.2-chat',
  };

  const generated = await generateMonthlyFinancialReport(input);
  const stored: StoredMonthlyReport = {
    ...generated,
    generatedAt: new Date().toISOString(),
    transactionCount: relevantTransactions.length,
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
  generatedAt: string;
  transactionCount: number;
};

export async function loadStoredYearlyReport(year: number): Promise<StoredYearlyReport | null> {
  try {
    const client = await getBlobContainer();
    const blob = client.getBlobClient(yearlyReportBlobPath(year));
    const dl = await blob.download(0);
    if (!dl.readableStreamBody) return null;
    const text = await streamToString(dl.readableStreamBody);
    return JSON.parse(text) as StoredYearlyReport;
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) return null;
    console.warn("loadStoredYearlyReport: failed to load report", { year, message: error.message });
    return null;
  }
}

async function saveStoredYearlyReport(year: number, report: StoredYearlyReport): Promise<void> {
  const client = await getBlobContainer();
  const block = client.getBlockBlobClient(yearlyReportBlobPath(year));
  const body = JSON.stringify(report, null, 2);
  await block.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

const INVESTMENT_CATEGORIES = new Set([
  'Stocks', 'Mutual Funds', 'Recurring Deposit', 'Equity', 'Debt', 'Gold/Silver', 'US Stocks', 'Crypto',
]);

function toAIShape(t: Awaited<ReturnType<typeof getTransactions>>[number]): AITransactionForAnalysis | null {
  const validated = AITransactionForAnalysisSchema.safeParse({
    description: t.description,
    amount: t.amount,
    date: getCalendarDateString(t.date) || t.date.toISOString(),
    categoryName: t.category?.name,
    paymentMethodName: t.paymentMethod?.name,
    expenseType: t.expenseType,
    type: t.type,
    source: t.source,
  });
  return validated.success ? validated.data : null;
}

function buildMonthlySummaries(txns: AITransactionForAnalysis[], year: number): MonthlySummary[] {
  const monthNamesArr = monthNames;
  const summaries: MonthlySummary[] = monthNamesArr.map((name, idx) => ({
    monthName: name, monthIndex: idx,
    totalIncome: 0, totalExpenses: 0,
    needs: 0, wants: 0, investments: 0,
    transactionCount: 0,
    topCategories: [],
  }));

  const perMonthCategoryAgg: Record<number, Map<string, { amount: number; count: number }>> = {};
  for (let i = 0; i < 12; i++) perMonthCategoryAgg[i] = new Map();

  for (const t of txns) {
    const parts = getCalendarDateParts(t.date);
    if (!parts || parts.year !== year) continue;
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
      else s.needs += t.amount; // default unknown to needs
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
  model: AIModel,
  options?: { forceRegenerate?: boolean }
): Promise<StoredYearlyReport> {
  if (!options?.forceRegenerate) {
    const cached = await loadStoredYearlyReport(year);
    if (cached) return cached;
  }

  const allTransactions = await getTransactions();
  const yearTxnsRaw = allTransactions.filter(t => isSameCalendarYear(t.date, year));
  const yearTxns: AITransactionForAnalysis[] = yearTxnsRaw
    .map(toAIShape)
    .filter((t): t is AITransactionForAnalysis => t !== null);

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
    model: model || 'gpt-5.2-chat',
  };

  const generated = await generateYearlyFinancialReport(input);
  const stored: StoredYearlyReport = {
    ...generated,
    generatedAt: new Date().toISOString(),
    transactionCount: yearTxns.length,
  };

  try {
    await saveStoredYearlyReport(year, stored);
  } catch (err: any) {
    console.warn("getYearlyReport: failed to persist report", { year, error: err?.message });
  }

  return stored;
}
