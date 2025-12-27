<<<<<<< HEAD
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { MonthlyFinancialReportOutput } from '@/lib/types';
import { revalidatePath } from 'next/cache';

const REPORTS_DIR = 'reports/';
const REPORTS_PAGE_PATH = '/reports';

let blobContainerClientInstance: ContainerClient; 

async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer | string) => {
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

async function getAzureBlobContainerClient(): Promise<ContainerClient> {
  if (blobContainerClientInstance) {
    return blobContainerClientInstance;
  }
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    throw new Error("Azure Storage environment variables are not configured for reports.");
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    blobContainerClientInstance = blobServiceClient.getContainerClient(containerName);
    return blobContainerClientInstance;
  } catch (error: any) {
    console.error("Azure CRITICAL Error (reports.ts): Failed to initialize BlobServiceClient.", error);
    throw new Error(`Could not connect to Azure Blob Storage for reports. Original error: ${error.message}`);
  }
}

export async function saveReport(monthYearKey: string, reportData: MonthlyFinancialReportOutput): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(monthYearKey)) {
    throw new Error("Invalid monthYearKey format. Expected 'YYYY-MM'.");
  }
  
  const client = await getAzureBlobContainerClient();
  const filePath = `${REPORTS_DIR}${monthYearKey}.json`;
  const blockBlobClient = client.getBlockBlobClient(filePath);

  try {
    const content = JSON.stringify(reportData, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    console.log(`Azure Info (saveReport): Successfully saved report for ${monthYearKey}.`);
    revalidatePath(REPORTS_PAGE_PATH);
  } catch (error: any) {
    console.error(`Azure Error (saveReport): Failed to save report for ${monthYearKey}.`, error);
    throw new Error(`Could not save report to Azure blob storage. Original error: ${error.message}`);
  }
}

export async function getReport(monthYearKey: string): Promise<MonthlyFinancialReportOutput | null> {
   if (!/^\d{4}-\d{2}$/.test(monthYearKey)) {
    throw new Error("Invalid monthYearKey format. Expected 'YYYY-MM'.");
  }

  const client = await getAzureBlobContainerClient();
  const filePath = `${REPORTS_DIR}${monthYearKey}.json`;
  const blobClient = client.getBlobClient(filePath);
  
  try {
    const downloadResponse = await blobClient.download(0);
    if (!downloadResponse.readableStreamBody) {
        return null; // Blob exists but is empty
    }
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
    return JSON.parse(buffer.toString()) as MonthlyFinancialReportOutput;
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) {
      return null; // Report for this month doesn't exist, which is a valid state
    }
    console.error(`Azure Error (getReport): Failed to retrieve report for ${monthYearKey}.`, error);
    throw new Error(`Could not retrieve report. Original error: ${error.message}`);
  }
=======

'use server';

import { generateMonthlyFinancialReport, type MonthlyFinancialReportInput, type MonthlyFinancialReportOutput } from "@/ai/flows/monthly-financial-report-flow";
import { AITransactionForAnalysisSchema, type AIModel } from "@/lib/types";
import { getTransactions } from "./transactions";

export async function getMonthlyReport(month: number, year: number, model: AIModel): Promise<MonthlyFinancialReportOutput> {
  const allTransactions = await getTransactions();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const relevantTransactions = allTransactions
    .filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getMonth() === month && transactionDate.getFullYear() === year;
    })
    .map(t => {
      // Validate and transform each transaction to match AITransactionForAnalysisSchema
      const validatedData = AITransactionForAnalysisSchema.safeParse({
        description: t.description,
        amount: t.amount,
        date: t.date.toISOString(),
        categoryName: t.category?.name,
        paymentMethodName: t.paymentMethod?.name,
        expenseType: t.expenseType,
      });

      if(validatedData.success) {
        return validatedData.data;
      }
      console.warn(`Skipping invalid transaction for AI report: ${t.description}`, validatedData.error.flatten().fieldErrors);
      return null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  if (relevantTransactions.length === 0) {
    throw new Error(`No transactions found for ${monthNames[month]} ${year}.`);
  }

  const input: MonthlyFinancialReportInput = {
    monthName: monthNames[month],
    year: year,
    transactions: relevantTransactions,
    model: model,
  };

  return await generateMonthlyFinancialReport(input);
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
}
