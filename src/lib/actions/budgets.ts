
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { Budget, BudgetInput } from '@/lib/types';
import { BudgetInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const INTERNAL_DATA_DIR = 'internal/data/';
const BUDGETS_BLOB_PATH = `${INTERNAL_DATA_DIR}budgets.json`;

let blobContainerClientInstance: BlobContainerClient; 

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

async function getAzureBlobContainerClient(): Promise<BlobContainerClient> {
  if (blobContainerClientInstance) {
    return blobContainerClientInstance;
  }
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString) {
    console.error("Azure Critical Error (budgets.ts - Blob Client): AZURE_STORAGE_CONNECTION_STRING is not configured.");
    throw new Error("Azure Storage Connection String for Blob is not configured.");
  }
  if (!containerName) {
    console.error("Azure Critical Error (budgets.ts - Blob Client): AZURE_STORAGE_CONTAINER_NAME is not configured.");
    throw new Error("Azure Storage Container Name for Blob is not configured.");
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    blobContainerClientInstance = blobServiceClient.getContainerClient(containerName);
    return blobContainerClientInstance;
  } catch (error: any) {
    console.error("Azure CRITICAL Error (budgets.ts - Blob Client): Failed to initialize BlobServiceClient.", error.message, error.stack);
    throw new Error(`Could not connect to Azure Blob Storage. Original error: ${error.message}`);
  }
}

async function ensureBudgetsFile(defaultContent: Budget[] = []): Promise<Budget[]> {
  const client = await getAzureBlobContainerClient();
  const blobClient = client.getBlobClient(BUDGETS_BLOB_PATH);

  try {
    const downloadBlockBlobResponse = await blobClient.download(0);
    if (!downloadBlockBlobResponse.readableStreamBody) {
      throw new RestError("Blob has no readable stream body", undefined, 404);
    }
    const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    return JSON.parse(buffer.toString()) as Budget[];
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) {
      const blockBlobClient = client.getBlockBlobClient(BUDGETS_BLOB_PATH);
      const content = JSON.stringify(defaultContent, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      return defaultContent;
    }
    console.error(`Azure Error (ensureBudgetsFile): Failed to ensure/download blob ${BUDGETS_BLOB_PATH}.`, error.message);
    throw new Error(`Could not access or create blob file ${BUDGETS_BLOB_PATH}. Original error: ${error.message}`);
  }
}

export async function getBudgets(): Promise<Budget[]> {
  try {
    return await ensureBudgetsFile([]);
  } catch (error: any) {
    console.error("Azure Error (getBudgets): Could not fetch budgets from Blob. Error:", error.message);
    return []; // Return empty array on failure
  }
}

export async function addBudget(data: BudgetInput): Promise<Budget> {
  const validation = BudgetInputSchema.safeParse(data);
  if (!validation.success) {
    const readableErrors = Object.entries(validation.error.flatten().fieldErrors).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid budget data: ${readableErrors}`);
  }

  const allBudgets = await getBudgets();
  
  const newBudget: Budget = { 
      id: cuid(), 
      ...validation.data, 
      createdAt: new Date().toISOString(), 
      updatedAt: new Date().toISOString() 
    };
  const updatedBudgets = [...allBudgets, newBudget];

  const client = await getAzureBlobContainerClient();
  const blockBlobClient = client.getBlockBlobClient(BUDGETS_BLOB_PATH);
  await blockBlobClient.upload(JSON.stringify(updatedBudgets, null, 2), Buffer.byteLength(JSON.stringify(updatedBudgets, null, 2)));
  
  revalidatePath('/settings');
  revalidatePath('/');
  return newBudget;
}

export async function updateBudget(id: string, data: Partial<Pick<Budget, 'amount' | 'name'>>): Promise<Budget> {
  if (!id) throw new Error("Budget ID is required for update.");
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount <= 0)) {
    throw new Error("Budget amount must be a positive number.");
  }
  
  const allBudgets = await getBudgets();
  const budgetIndex = allBudgets.findIndex(b => b.id === id);

  if (budgetIndex === -1) {
    throw new Error("Budget not found.");
  }

  const updatedBudget: Budget = {
    ...allBudgets[budgetIndex],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  allBudgets[budgetIndex] = updatedBudget;
  
  const client = await getAzureBlobContainerClient();
  const blockBlobClient = client.getBlockBlobClient(BUDGETS_BLOB_PATH);
  await blockBlobClient.upload(JSON.stringify(allBudgets, null, 2), Buffer.byteLength(JSON.stringify(allBudgets, null, 2)));

  revalidatePath('/settings');
  revalidatePath('/');
  return updatedBudget;
}

export async function deleteBudget(id: string): Promise<{ success: boolean }> {
  const allBudgets = await getBudgets();
  const updatedBudgets = allBudgets.filter(b => b.id !== id);

  if (allBudgets.length === updatedBudgets.length) {
    throw new Error("Budget not found.");
  }

  const client = await getAzureBlobContainerClient();
  const blockBlobClient = client.getBlockBlobClient(BUDGETS_BLOB_PATH);
  await blockBlobClient.upload(JSON.stringify(updatedBudgets, null, 2), Buffer.byteLength(JSON.stringify(updatedBudgets, null, 2)));

  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true };
}
