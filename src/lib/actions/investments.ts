
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { InvestmentSettings, FundEntry, FundEntryInput, MonthlyInvestmentData, InvestmentCategory, CategoryTarget, FundTarget } from '@/lib/types';
import { InvestmentSettingsSchema, FundEntryInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const SETTINGS_DIR = 'internal/data/';
const INVESTMENT_SETTINGS_BLOB_PATH = `${SETTINGS_DIR}investment_settings.json`;

const MONTHLY_DATA_DIR = 'investment-data/';

let blobContainerClientInstance: ContainerClient; 

// --- Client and Helpers ---

async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer | string) => chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    readableStream.on('error', reject);
  });
}

async function getAzureBlobContainerClient(): Promise<BlobContainerClient> {
  if (blobContainerClientInstance) return blobContainerClientInstance;
  
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    throw new Error("Azure Storage environment variables are not configured for investments.");
  }
  
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  blobContainerClientInstance = blobServiceClient.getContainerClient(containerName);
  return blobContainerClientInstance;
}

// --- Investment Settings (Targets) Functions ---

export async function getInvestmentSettings(): Promise<InvestmentSettings> {
  const client = await getAzureBlobContainerClient();
  const blobClient = client.getBlobClient(INVESTMENT_SETTINGS_BLOB_PATH);
  
  const defaultEquityFund: FundTarget = { id: cuid(), name: "Parag Parikh Flexi Cap", targetAmount: 5000 };
  const defaultDebtFund: FundTarget = { id: cuid(), name: "HDFC Liquid Fund", targetAmount: 2000 };

  const defaultSettings: InvestmentSettings = { 
    monthlyTarget: 25000, 
    categoryTargets: [
        { id: cuid(), category: 'Equity', funds: [defaultEquityFund] },
        { id: cuid(), category: 'Debt', funds: [defaultDebtFund] },
        { id: cuid(), category: 'Gold/Silver', funds: [] },
        { id: cuid(), category: 'US Stocks', funds: [] },
        { id: cuid(), category: 'Crypto', funds: [] },
        { id: cuid(), category: 'Other', funds: [] },
    ]
  };

  try {
    const downloadResponse = await blobClient.download(0);
    if (!downloadResponse.readableStreamBody) return defaultSettings;
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
    const parsedSettings = JSON.parse(buffer.toString());
    // Data migration/check: Ensure all categories exist
    const existingCategories = new Set(parsedSettings.categoryTargets.map((ct: CategoryTarget) => ct.category));
    let needsUpdate = false;
    defaultSettings.categoryTargets.forEach(defaultTarget => {
        if(!existingCategories.has(defaultTarget.category)) {
            parsedSettings.categoryTargets.push(defaultTarget);
            needsUpdate = true;
        }
    });

    if (needsUpdate) {
        console.log("Investment settings updated with new categories.");
        return await saveInvestmentSettings(parsedSettings);
    }
    
    return parsedSettings;
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) {
      // File doesn't exist, create it with default content
      const blockBlobClient = client.getBlockBlobClient(INVESTMENT_SETTINGS_BLOB_PATH);
      const content = JSON.stringify(defaultSettings, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      return defaultSettings;
    }
    console.error(`Failed to get investment settings:`, error);
    throw new Error(`Could not retrieve investment settings. Original error: ${error.message}`);
  }
}

export async function saveInvestmentSettings(settings: Partial<InvestmentSettings>): Promise<InvestmentSettings> {
    const existingSettings = await getInvestmentSettings();
    
    const validatedSettings: InvestmentSettings = {
        monthlyTarget: settings.monthlyTarget ?? existingSettings.monthlyTarget,
        categoryTargets: settings.categoryTargets ?? existingSettings.categoryTargets,
    };
    
    const validation = InvestmentSettingsSchema.safeParse(validatedSettings);
    if(!validation.success){
         throw new Error(`Invalid investment settings: ${JSON.stringify(validation.error.flatten().fieldErrors)}`);
    }

    const client = await getAzureBlobContainerClient();
    const blockBlobClient = client.getBlockBlobClient(INVESTMENT_SETTINGS_BLOB_PATH);
    const content = JSON.stringify(validation.data, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content));

    revalidatePath('/');
    return validation.data;
}

// --- Monthly Fund Entry Functions ---

export async function getMonthlyInvestmentData(monthYear: string): Promise<MonthlyInvestmentData> {
    if (!/^\d{4}-\d{2}$/.test(monthYear)) throw new Error("Invalid monthYear format. Expected 'YYYY-MM'.");
    
    const client = await getAzureBlobContainerClient();
    const blobName = `${MONTHLY_DATA_DIR}${monthYear}.json`;
    const blobClient = client.getBlobClient(blobName);
    const defaultData: MonthlyInvestmentData = { monthYear, entries: [], updatedAt: new Date().toISOString() };

    try {
        const downloadResponse = await blobClient.download(0);
        if (!downloadResponse.readableStreamBody) return defaultData;
        const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
        return JSON.parse(buffer.toString());
    } catch (error: any) {
        if (error instanceof RestError && error.statusCode === 404) {
            return defaultData;
        }
        console.error(`Failed to get monthly investment data for ${monthYear}:`, error);
        throw new Error(`Could not retrieve data for ${monthYear}. Original error: ${error.message}`);
    }
}

export async function addFundEntry(data: FundEntryInput): Promise<FundEntry> {
    const validation = FundEntryInputSchema.safeParse(data);
    if (!validation.success) {
        throw new Error(`Invalid fund entry data: ${JSON.stringify(validation.error.flatten().fieldErrors)}`);
    }

    const { monthYear, ...rest } = validation.data;
    const monthlyData = await getMonthlyInvestmentData(monthYear);
    const newEntry: FundEntry = {
        id: cuid(),
        ...rest,
        date: rest.date.toISOString(),
        createdAt: new Date().toISOString(),
    };

    const updatedData: MonthlyInvestmentData = {
        ...monthlyData,
        entries: [...monthlyData.entries, newEntry],
        updatedAt: new Date().toISOString(),
    };

    const client = await getAzureBlobContainerClient();
    const blobName = `${MONTHLY_DATA_DIR}${monthYear}.json`;
    const blockBlobClient = client.getBlockBlobClient(blobName);
    const content = JSON.stringify(updatedData, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content));

    revalidatePath('/');
    return newEntry;
}

export async function deleteFundEntry(monthYear: string, entryId: string): Promise<{ success: boolean }> {
    if (!/^\d{4}-\d{2}$/.test(monthYear)) throw new Error("Invalid monthYear format.");

    const monthlyData = await getMonthlyInvestmentData(monthYear);
    const updatedEntries = monthlyData.entries.filter(entry => entry.id !== entryId);

    if (updatedEntries.length === monthlyData.entries.length) {
        throw new Error("Fund entry not found.");
    }

    const updatedData: MonthlyInvestmentData = {
        ...monthlyData,
        entries: updatedEntries,
        updatedAt: new Date().toISOString(),
    };

    const client = await getAzureBlobContainerClient();
    const blobName = `${MONTHLY_DATA_DIR}${monthYear}.json`;
    const blockBlobClient = client.getBlockBlobClient(blobName);
    const content = JSON.stringify(updatedData, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content));

    revalidatePath('/');
    return { success: true };
}

export async function saveAISummary(monthYear: string, summary: string): Promise<MonthlyInvestmentData> {
    if (!/^\d{4}-\d{2}$/.test(monthYear)) throw new Error("Invalid monthYear format.");
    
    const monthlyData = await getMonthlyInvestmentData(monthYear);
    const updatedData: MonthlyInvestmentData = {
        ...monthlyData,
        aiSummary: summary,
        updatedAt: new Date().toISOString(),
    };

    const client = await getAzureBlobContainerClient();
    const blobName = `${MONTHLY_DATA_DIR}${monthYear}.json`;
    const blockBlobClient = client.getBlockBlobClient(blobName);
    const content = JSON.stringify(updatedData, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content));

    revalidatePath('/');
    return updatedData;
}
