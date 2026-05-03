
'use server';

import { generateMonthlyFinancialReport, type MonthlyFinancialReportInput, type MonthlyFinancialReportOutput } from "@/ai/flows/monthly-financial-report-flow";
import { AITransactionForAnalysisSchema, type AIModel } from "@/lib/types";
import { getTransactions } from "./transactions";
import { getCalendarDateString, isSameCalendarMonth } from "@/lib/date-utils";
import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const REPORTS_DIR = 'internal/data/monthly-reports/';
function reportBlobPath(year: number, month: number) {
  return `${REPORTS_DIR}${year}-${String(month + 1).padStart(2, '0')}.json`;
}

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
