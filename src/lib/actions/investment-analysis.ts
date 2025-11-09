
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { MonthlyInvestmentAnalysis, InvestmentAnalysisOutput } from '@/lib/types';
import { revalidatePath } from 'next/cache';

const INVESTMENT_ANALYSIS_DIR = 'investment-analysis/';

let blobContainerClientInstance: BlobContainerClient; 

// Helper to convert stream to buffer
async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer | string) => {
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    readableStream.on('error', reject);
  });
}

// Helper to get a singleton instance of the Blob Container Client
async function getAzureBlobContainerClient(): Promise<BlobContainerClient> {
  if (blobContainerClientInstance) {
    return blobContainerClientInstance;
  }
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    throw new Error("Azure Storage environment variables are not configured.");
  }
  
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  blobContainerClientInstance = blobServiceClient.getContainerClient(containerName);
  return blobContainerClientInstance;
}

/**
 * Retrieves the investment analysis data for a specific month and year.
 * @param monthYear - The identifier for the month, format: "YYYY-MM".
 * @returns The stored analysis data, or null if not found.
 */
export async function getInvestmentAnalysisForMonth(monthYear: string): Promise<MonthlyInvestmentAnalysis | null> {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    throw new Error("Invalid monthYear format. Expected 'YYYY-MM'.");
  }
  
  const client = await getAzureBlobContainerClient();
  const blobName = `${INVESTMENT_ANALYSIS_DIR}${monthYear}.json`;
  const blobClient = client.getBlobClient(blobName);

  try {
    const downloadBlockBlobResponse = await blobClient.download(0);
    if (!downloadBlockBlobResponse.readableStreamBody) {
      return null;
    }
    const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    return JSON.parse(buffer.toString()) as MonthlyInvestmentAnalysis;
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) {
      return null; // File doesn't exist, which is a normal case
    }
    console.error(`Failed to get investment analysis for ${monthYear}:`, error);
    throw new Error(`Could not retrieve investment analysis data. Original error: ${error.message}`);
  }
}

/**
 * Saves or updates the investment analysis data for a specific month and year.
 * @param monthYear - The identifier for the month, format: "YYYY-MM".
 * @param data - An object containing the notes and optional AI analysis to save.
 * @returns The newly saved data.
 */
export async function saveInvestmentAnalysis(
  monthYear: string, 
  data: { investmentNotes: string; aiAnalysis?: InvestmentAnalysisOutput | null }
): Promise<MonthlyInvestmentAnalysis> {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    throw new Error("Invalid monthYear format. Expected 'YYYY-MM'.");
  }
  
  const client = await getAzureBlobContainerClient();
  const blobName = `${INVESTMENT_ANALYSIS_DIR}${monthYear}.json`;
  const blockBlobClient = client.getBlockBlobClient(blobName);

  // Fetch existing data to merge, if it exists
  const existingData = await getInvestmentAnalysisForMonth(monthYear);
  
  const dataToSave: MonthlyInvestmentAnalysis = {
    monthYear,
    investmentNotes: data.investmentNotes,
    // If new AI analysis is provided, use it. Otherwise, keep the existing one.
    aiAnalysis: data.aiAnalysis !== undefined ? data.aiAnalysis ?? undefined : existingData?.aiAnalysis,
    updatedAt: new Date().toISOString(),
  };

  try {
    const content = JSON.stringify(dataToSave, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    
    // Revalidate the dashboard path so changes are reflected immediately
    revalidatePath('/');
    
    return dataToSave;
  } catch (error: any) {
    console.error(`Failed to save investment analysis for ${monthYear}:`, error);
    throw new Error(`Could not save investment analysis data. Original error: ${error.message}`);
  }
}
