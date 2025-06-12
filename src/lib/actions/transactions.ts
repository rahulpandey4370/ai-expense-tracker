
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { AppTransaction, RawTransaction, Category, PaymentMethod, TransactionInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types';
import { defaultCategories, defaultPaymentMethods } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const CATEGORIES_BLOB_PATH = 'internal/data/categories.json';
const PAYMENT_METHODS_BLOB_PATH = 'internal/data/payment-methods.json';
const TRANSACTIONS_DIR = 'transactions/';

let containerClientInstance: ContainerClient;

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

async function getAzureContainerClient(): Promise<ContainerClient> {
  console.log("Azure Info: Attempting to get Azure Container Client (transactions)...");
  if (containerClientInstance) {
    console.log("Azure Info: Returning cached container client instance (transactions).");
    return containerClientInstance;
  }
  console.log("Azure Info: No cached client instance, creating new one (transactions).");

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  console.log(`Azure Info: Read AZURE_STORAGE_CONNECTION_STRING (transactions). Is present: ${!!connectionString}, Length (if present): ${connectionString?.length}`);
  console.log(`Azure Info: Read AZURE_STORAGE_CONTAINER_NAME (transactions): '${containerName}'. Is present: ${!!containerName}, Type: ${typeof containerName}`);


  if (!connectionString) {
    console.error("Azure Critical Error: AZURE_STORAGE_CONNECTION_STRING is not configured for transactions.");
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONNECTION_STRING is not configured for transactions.");
  }
  if (!containerName || typeof containerName !== 'string' || containerName.trim() === '') {
    console.error(`Azure Critical Error: AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string for transactions. Value: '${containerName}'`);
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string for transactions. Please check Vercel environment variables.");
  }

  try {
    console.log(`Azure Info: Attempting to create BlobServiceClient from connection string (transactions)... (First 30 chars of CS: ${connectionString.substring(0,30)}...)`);
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    console.log(`Azure Info: BlobServiceClient created successfully (transactions). Attempting to get container client for '${containerName}'...`);
    const client = blobServiceClient.getContainerClient(containerName);
    console.log(`Azure Info: Container client for '${containerName}' (transactions) obtained successfully.`);
    containerClientInstance = client;
    return containerClientInstance;
  } catch (error: any) {
    console.error(`Azure CRITICAL Error: Failed to initialize BlobServiceClient or ContainerClient for transactions. CS present: ${!!connectionString}, CN: ${containerName}. Error Type: ${error.name}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not connect to Azure Blob Storage for transactions. Check configuration and credentials. Original error: ${error.message}`);
  }
}

async function ensureAzureBlobFile<T>(filePath: string, defaultData: T[]): Promise<T[]> {
  const client = await getAzureContainerClient();
  const blobClient = client.getBlobClient(filePath);
  console.log(`Azure Info: Ensuring blob file: ${filePath}`);

  try {
    console.log(`Azure Info: Checking existence of ${filePath}`);
    const fileExists = await blobClient.exists();
    console.log(`Azure Info: Blob ${filePath} exists: ${fileExists}`);

    if (fileExists) {
      console.log(`Azure Info: Attempting to download ${filePath}`);
      const downloadBlockBlobResponse = await blobClient.download(0);
      console.log(`Azure Info: Download response received for ${filePath}. Stream available: ${!!downloadBlockBlobResponse.readableStreamBody}`);
      
      if (!downloadBlockBlobResponse.readableStreamBody) {
        console.error(`Azure Error: Blob ${filePath} has no readable stream body despite existing.`);
        throw new Error(`Blob ${filePath} has no readable stream body.`);
      }
      const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
      console.log(`Azure Info: Successfully read ${filePath} into buffer, size: ${buffer.length}`);
      return JSON.parse(buffer.toString());
    } else {
      console.log(`Azure Info: Blob ${filePath} not found. Attempting to create with default data.`);
      const blockBlobClient = client.getBlockBlobClient(filePath);
      const content = JSON.stringify(defaultData, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      console.log(`Azure Info: Successfully created Azure blob ${filePath} with default data.`);
      return defaultData;
    }
  } catch (error: any) {
    console.error(`Azure Error: Error in ensureAzureBlobFile for ${filePath}. Status: ${error.statusCode}, Code: ${error.code}, Message: ${error.message}`, error.stack);
    if (error.details) console.error(`Azure Error Details for ${filePath}:`, error.details);
    throw new Error(`Azure Blob storage error for ${filePath}: ${error.message || 'Unknown error ensuring Azure blob file.'}. Check Azure Blob Storage and Vercel logs.`);
  }
}

export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  try {
    console.log(`Azure Info: Fetching categories (type: ${type || 'all'}).`);
    const allCategories = await ensureAzureBlobFile<Category>(CATEGORIES_BLOB_PATH, defaultCategories);
    if (type) {
      return allCategories.filter(c => c.type === type);
    }
    return allCategories;
  } catch (error: any) {
    console.error('Azure Error: Failed to fetch categories:', error.message, error.stack);
    throw new Error(`Database query failed: Could not fetch categories from Azure. Original error: ${error.message}`);
  }
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
   try {
    console.log(`Azure Info: Fetching payment methods.`);
    return await ensureAzureBlobFile<PaymentMethod>(PAYMENT_METHODS_BLOB_PATH, defaultPaymentMethods);
  } catch (error: any) {
    console.error('Azure Error: Failed to fetch payment methods:', error.message, error.stack);
    throw new Error(`Database query failed: Could not fetch payment methods from Azure. Original error: ${error.message}`);
  }
}

export async function getTransactions(options?: { limit?: number }): Promise<AppTransaction[]> {
  console.log(`Azure Info (getTransactions): Starting to fetch transactions. Options: ${JSON.stringify(options)}`);
  let allCategories: Category[] = [];
  let allPaymentMethods: PaymentMethod[] = [];
  const client = await getAzureContainerClient();

  try {
    console.log("Azure Info (getTransactions): Fetching categories and payment methods.");
    [allCategories, allPaymentMethods] = await Promise.all([
      getCategories(),
      getPaymentMethods()
    ]);
    console.log(`Azure Info (getTransactions): Loaded ${allCategories.length} categories and ${allPaymentMethods.length} payment methods.`);
  } catch (error: any) {
    console.error("Azure Critical Error (getTransactions): Essential data (categories/payment methods) could not be loaded. Cannot proceed.", error.message, error.stack);
    throw new Error(`Essential data (categories/payment methods) could not be loaded for transactions (Azure). Original error: ${error.message}`);
  }

  const categoryMap = new Map(allCategories.map(c => [c.id, c]));
  const paymentMethodMap = new Map(allPaymentMethods.map(pm => [pm.id, pm]));

  let transactions: AppTransaction[] = [];
  let processedBlobCount = 0;
  const limit = options?.limit;

  try {
    console.log(`Azure Info (getTransactions): Listing blobs in directory: ${TRANSACTIONS_DIR}`);
    // Note: Azure Blob Storage lists blobs lexicographically. If IDs (like cuid) are time-ordered, this gives a rough chronological order.
    // For true "most recent N", all blobs would need to be listed, metadata (if available) or content fetched for dates, then sorted.
    // This implementation limits the *number of blobs processed* from the beginning of the list.
    const blobsIterator = client.listBlobsFlat({ prefix: TRANSACTIONS_DIR });
    for await (const blob of blobsIterator) {
      processedBlobCount++;
      // console.log(`Azure Info (getTransactions): Processing blob #${processedBlobCount}: ${blob.name}`);
      if (!blob.name || !blob.name.endsWith('.json') || blob.name === TRANSACTIONS_DIR) {
        // console.log(`Azure Debug (getTransactions): Skipping non-JSON or directory blob: ${blob.name}`);
        continue;
      }
      try {
        const blobClient = client.getBlobClient(blob.name);
        // console.log(`Azure Info (getTransactions): Attempting to download blob: ${blob.name}`);
        const downloadBlockBlobResponse = await blobClient.download(0);
        // console.log(`Azure Info (getTransactions): Downloaded blob: ${blob.name}. Stream available: ${!!downloadBlockBlobResponse.readableStreamBody}`);
        
        if (!downloadBlockBlobResponse.readableStreamBody) {
          console.warn(`Azure Warning (getTransactions): Blob ${blob.name} has no readable stream body, skipping.`);
          continue;
        }
        // console.log(`Azure Info (getTransactions): Converting stream to buffer for blob: ${blob.name}`);
        const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
        // console.log(`Azure Info (getTransactions): Converted to buffer for blob: ${blob.name}, size: ${buffer.length}`);
        const rawTx: RawTransaction = JSON.parse(buffer.toString());
        transactions.push({
          ...rawTx,
          date: new Date(rawTx.date),
          createdAt: new Date(rawTx.createdAt),
          updatedAt: new Date(rawTx.updatedAt),
          category: rawTx.categoryId ? categoryMap.get(rawTx.categoryId) : undefined,
          paymentMethod: rawTx.paymentMethodId ? paymentMethodMap.get(rawTx.paymentMethodId) : undefined,
        });

        if (limit && transactions.length >= limit) {
          console.log(`Azure Info (getTransactions): Reached processing limit of ${limit}. Breaking loop after processing ${transactions.length} transactions from ${processedBlobCount} listed blobs.`);
          break;
        }

      } catch (fetchError: any) {
        console.error(`Azure Error (getTransactions): Error processing individual transaction blob ${blob.name}. Status: ${fetchError.statusCode}, Message: ${fetchError.message}`, fetchError.stack);
        if (fetchError instanceof RestError && fetchError.statusCode === 404) {
             console.warn(`Azure Warning (getTransactions): Transaction blob ${blob.name} not found during processing, skipping.`);
        }
      }
    }
    console.log(`Azure Info (getTransactions): Finished processing. Total blobs listed/attempted: ${processedBlobCount}. Transactions parsed: ${transactions.length}.`);
  } catch (error: any)
   {
    console.error('Azure Error (getTransactions): Failed to list or process transactions from Azure blob.', error.message, error.stack);
    if (error instanceof RestError && error.statusCode === 404 && error.message.includes("ContainerNotFound")) {
        console.warn("Azure Warning (getTransactions): Container for transactions not found. Returning empty array. The container might need to be created in Azure portal.");
        return [];
    }
    throw new Error(`Could not fetch transactions from Azure Blob store. Original error: ${error.message}`);
  }
  
  // Sort by date descending after fetching and potentially limiting
  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  console.log("Azure Info (addTransaction): Attempting to add transaction...");
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('Azure Error (addTransaction): Validation error:', readableErrors);
    throw new Error(`Invalid transaction data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const rawTransaction: RawTransaction = { id, ...validation.data, date: validation.data.date.toISOString(), description: validation.data.description || '', createdAt: now, updatedAt: now };
  const client = await getAzureContainerClient();
  const filePath = `${TRANSACTIONS_DIR}${id}.json`;
  const blockBlobClient = client.getBlockBlobClient(filePath);

  try {
    console.log(`Azure Info (addTransaction): Adding transaction ${id} to ${filePath}`);
    const content = JSON.stringify(rawTransaction, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    console.log(`Azure Info (addTransaction): Successfully added transaction ${id}`);
    revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');

    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = validation.data.categoryId ? allCategories.find(c => c.id === validation.data.categoryId) : undefined;
    const paymentMethod = validation.data.paymentMethodId ? allPaymentMethods.find(pm => pm.id === validation.data.paymentMethodId) : undefined;

    return { ...rawTransaction, date: new Date(rawTransaction.date), createdAt: new Date(rawTransaction.createdAt), updatedAt: new Date(rawTransaction.updatedAt), category, paymentMethod };
  } catch (error: any) {
    console.error(`Azure Error (addTransaction): Failed to add transaction ${id} to Azure blob. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not add transaction to Azure blob storage. Original error: ${error.message}`);
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  console.log(`Azure Info (updateTransaction): Attempting to update transaction ${id}...`);
  const client = await getAzureContainerClient();
  const filePath = `${TRANSACTIONS_DIR}${id}.json`;
  const blobClient = client.getBlobClient(filePath);
  let existingRawTx: RawTransaction;

  try {
    console.log(`Azure Info (updateTransaction): Fetching transaction ${id} for update from ${filePath}`);
    const downloadResponse = await blobClient.download(0);
    if (!downloadResponse.readableStreamBody) {
      console.error(`Azure Error (updateTransaction): Blob ${filePath} for update has no readable stream body.`);
      throw new Error(`Blob ${filePath} for update has no readable stream body.`);
    }
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
    existingRawTx = JSON.parse(buffer.toString());
    console.log(`Azure Info (updateTransaction): Successfully fetched transaction ${id} for update.`);
  } catch (error: any) {
    console.error(`Azure Error (updateTransaction): Failed to fetch transaction ${id} from Azure for update. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    if (error instanceof RestError && error.statusCode === 404) { throw new Error(`Transaction with ID ${id} not found for update.`); }
    throw new Error(`Could not retrieve transaction for update from Azure. Original error: ${error.message}`);
  }

  const updatedRawTx: RawTransaction = { ...existingRawTx };

  if (data.type !== undefined) updatedRawTx.type = data.type;
  if (data.date !== undefined) updatedRawTx.date = data.date.toISOString();
  if (data.amount !== undefined) updatedRawTx.amount = data.amount;
  if (data.description !== undefined) updatedRawTx.description = data.description;

  const finalType = data.type || existingRawTx.type;

  if (finalType === 'expense') {
    updatedRawTx.categoryId = data.categoryId !== undefined ? data.categoryId : existingRawTx.categoryId;
    updatedRawTx.paymentMethodId = data.paymentMethodId !== undefined ? data.paymentMethodId : existingRawTx.paymentMethodId;
    updatedRawTx.expenseType = data.expenseType !== undefined ? data.expenseType : existingRawTx.expenseType;
    updatedRawTx.source = undefined;
  } else if (finalType === 'income') {
    updatedRawTx.categoryId = data.categoryId !== undefined ? data.categoryId : existingRawTx.categoryId;
    updatedRawTx.source = data.source !== undefined ? data.source : existingRawTx.source;
    updatedRawTx.paymentMethodId = undefined;
    updatedRawTx.expenseType = undefined;
  }
  updatedRawTx.updatedAt = new Date().toISOString();

   const tempForValidation: TransactionInput = {
    type: updatedRawTx.type,
    date: new Date(updatedRawTx.date),
    amount: updatedRawTx.amount,
    description: updatedRawTx.description || '',
    categoryId: updatedRawTx.categoryId,
    paymentMethodId: updatedRawTx.paymentMethodId,
    source: updatedRawTx.source,
    expenseType: updatedRawTx.expenseType as 'need' | 'want' | 'investment' | undefined,
  };

  const validation = TransactionInputSchema.safeParse(tempForValidation);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('Azure Error (updateTransaction): Validation error after merge:', readableErrors, "Validated Data:", tempForValidation, "Final Raw to save:", updatedRawTx);
    throw new Error(`Invalid transaction data after update: ${readableErrors || "Validation failed."}`);
  }
  
  try {
    console.log(`Azure Info (updateTransaction): Updating transaction ${id} in ${filePath}`);
    const blockBlobClient = client.getBlockBlobClient(filePath);
    const content = JSON.stringify(updatedRawTx, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    console.log(`Azure Info (updateTransaction): Successfully updated transaction ${id}`);
    revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');

    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = updatedRawTx.categoryId ? allCategories.find(c => c.id === updatedRawTx.categoryId) : undefined;
    const paymentMethod = updatedRawTx.paymentMethodId ? allPaymentMethods.find(pm => pm.id === updatedRawTx.paymentMethodId) : undefined;

    return { ...updatedRawTx, date: new Date(updatedRawTx.date), createdAt: new Date(updatedRawTx.createdAt), updatedAt: new Date(updatedRawTx.updatedAt), category, paymentMethod };
  } catch (error: any) {
    console.error(`Azure Error (updateTransaction): Failed to update transaction ${id} in Azure blob. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not update transaction in Azure blob storage. Original error: ${error.message}`);
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  console.log(`Azure Info (deleteTransaction): Attempting to delete transaction ${id}...`);
  const client = await getAzureContainerClient();
  const filePath = `${TRANSACTIONS_DIR}${id}.json`;
  const blobClient = client.getBlobClient(filePath);
  try {
    console.log(`Azure Info (deleteTransaction): Deleting transaction ${id} from ${filePath}`);
    await blobClient.deleteIfExists();
    console.log(`Azure Info (deleteTransaction): Successfully deleted transaction ${id}`);
    revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');
    return { success: true };
  } catch (error: any) {
    console.error(`Azure Error (deleteTransaction): Failed to delete transaction ${id} from Azure blob. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not delete transaction from Azure blob storage. Original error: ${error.message}`);
  }
}
    
