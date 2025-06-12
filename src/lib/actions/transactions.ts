
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

// Helper function to convert a readable stream to a Buffer
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
  if (containerClientInstance) {
    return containerClientInstance;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    console.error("Azure Storage environment variables (AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_CONTAINER_NAME) are not configured.");
    throw new Error("Azure Storage environment variables are not configured.");
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const client = blobServiceClient.getContainerClient(containerName);
    containerClientInstance = client;
    return containerClientInstance;
  } catch (error) {
    console.error("Failed to initialize Azure Blob Service Client or Container Client:", error);
    throw new Error("Could not connect to Azure Blob Storage. Check configuration and credentials.");
  }
}


async function ensureAzureBlobFile<T>(filePath: string, defaultData: T[]): Promise<T[]> {
  const client = await getAzureContainerClient();
  const blobClient = client.getBlobClient(filePath);

  try {
    const fileExists = await blobClient.exists();
    if (fileExists) {
      const downloadBlockBlobResponse = await blobClient.download(0); // 0 for full download
      if (!downloadBlockBlobResponse.readableStreamBody) {
        throw new Error(`Blob ${filePath} has no readable stream body.`);
      }
      const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
      return JSON.parse(buffer.toString());
    } else {
      console.log(`Azure Blob ${filePath} not found. Attempting to create with default data.`);
      const blockBlobClient = client.getBlockBlobClient(filePath);
      const content = JSON.stringify(defaultData, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      console.log(`Successfully created Azure blob ${filePath} with default data.`);
      return defaultData;
    }
  } catch (error: any) {
    console.error(`Error ensuring Azure blob file ${filePath}:`, error);
    throw new Error(`Azure Blob storage error for ${filePath}: ${error.message || 'Unknown error ensuring Azure blob file.'}. Check Azure Blob Storage and logs.`);
  }
}


// --- Category Actions ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  try {
    const allCategories = await ensureAzureBlobFile<Category>(CATEGORIES_BLOB_PATH, defaultCategories);
    if (type) {
      return allCategories.filter(c => c.type === type);
    }
    return allCategories;
  } catch (error: any) {
    console.error('Failed to fetch categories from Azure:', error);
    throw new Error(`Database query failed: Could not fetch categories from Azure. Original error: ${error.message}`);
  }
}

// --- PaymentMethod Actions ---
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
   try {
    return await ensureAzureBlobFile<PaymentMethod>(PAYMENT_METHODS_BLOB_PATH, defaultPaymentMethods);
  } catch (error: any) {
    console.error('Failed to fetch payment methods from Azure:', error);
    throw new Error(`Database query failed: Could not fetch payment methods from Azure. Original error: ${error.message}`);
  }
}

// --- Transaction Actions ---
export async function getTransactions(): Promise<AppTransaction[]> {
  let allCategories: Category[] = [];
  let allPaymentMethods: PaymentMethod[] = [];
  const client = await getAzureContainerClient();

  try {
    [allCategories, allPaymentMethods] = await Promise.all([
      getCategories(),
      getPaymentMethods()
    ]);
  } catch (error: any) {
    console.error("Failed to load categories/payment methods for getTransactions (Azure), cannot proceed:", error);
    throw new Error(`Essential data (categories/payment methods) could not be loaded for transactions (Azure). Original error: ${error.message}`);
  }

  const categoryMap = new Map(allCategories.map(c => [c.id, c]));
  const paymentMethodMap = new Map(allPaymentMethods.map(pm => [pm.id, pm]));

  let transactions: AppTransaction[] = [];
  let hasAnyTransactionBlobs = false;
  try {
    const blobsIterator = client.listBlobsFlat({ prefix: TRANSACTIONS_DIR });
    const listedBlobs = [];
    for await (const blob of blobsIterator) {
        if (blob.name.endsWith('.json') && blob.name !== TRANSACTIONS_DIR) { 
            listedBlobs.push(blob);
            hasAnyTransactionBlobs = true;
        }
    }
    
    if (!hasAnyTransactionBlobs && allCategories.length > 0 && allPaymentMethods.length > 0) {
      console.log("No transactions found in Azure blob store, creating 3 mock transactions.");
      const salaryCategory = allCategories.find(c => c.name === 'Salary');
      const groceriesCategory = allCategories.find(c => c.name === 'Groceries');
      const foodDiningCategory = allCategories.find(c => c.name === 'Food and Dining');
      const upiPaymentMethod = allPaymentMethods.find(pm => pm.type === 'UPI'); 
      const ccPaymentMethod = allPaymentMethods.find(pm => pm.name === 'CC HDFC 7950'); 

      const mockTxData: TransactionInput[] = [];
      if (salaryCategory) mockTxData.push({ type: 'income', date: new Date(new Date().setDate(1)), amount: 75000, description: 'Monthly Salary', categoryId: salaryCategory.id, source: 'Company A' });
      if (groceriesCategory && upiPaymentMethod) mockTxData.push({ type: 'expense', date: new Date(new Date().setDate(5)), amount: 3500, description: 'Weekly Groceries', categoryId: groceriesCategory.id, paymentMethodId: upiPaymentMethod.id, expenseType: 'need' });
      if (foodDiningCategory && ccPaymentMethod) mockTxData.push({ type: 'expense', date: new Date(new Date().setDate(10)), amount: 1200, description: 'Dinner with Friends', categoryId: foodDiningCategory.id, paymentMethodId: ccPaymentMethod.id, expenseType: 'want' });
      
      if (mockTxData.length === 0 && (salaryCategory || groceriesCategory || foodDiningCategory)) {
         console.warn("Could not construct mock transactions due to missing specific default categories/payment methods for mocks.");
      }

      for (const txInput of mockTxData) {
        const validation = TransactionInputSchema.safeParse(txInput);
        if (!validation.success) { console.warn("Mock transaction data invalid, skipping:", validation.error.flatten().fieldErrors); continue; }
        const newId = cuid();
        const now = new Date().toISOString();
        const rawTx: RawTransaction = { id: newId, ...validation.data, date: validation.data.date.toISOString(), description: validation.data.description || '', createdAt: now, updatedAt: now };
        
        const blockBlobClient = client.getBlockBlobClient(`${TRANSACTIONS_DIR}${newId}.json`);
        const content = JSON.stringify(rawTx, null, 2);
        await blockBlobClient.upload(content, Buffer.byteLength(content), { blobHTTPHeaders: { blobContentType: 'application/json' }});
        
        const hydratedTx: AppTransaction = { ...rawTx, date: new Date(rawTx.date), createdAt: new Date(rawTx.createdAt), updatedAt: new Date(rawTx.updatedAt), category: rawTx.categoryId ? categoryMap.get(rawTx.categoryId) : undefined, paymentMethod: rawTx.paymentMethodId ? paymentMethodMap.get(rawTx.paymentMethodId) : undefined };
        transactions.push(hydratedTx);
      }
      revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');
    } else {
        for (const blob of listedBlobs) {
          try {
            const blobClient = client.getBlobClient(blob.name);
            const downloadBlockBlobResponse = await blobClient.download(0);
            if (!downloadBlockBlobResponse.readableStreamBody) {
              console.warn(`Blob ${blob.name} has no readable stream body, skipping.`);
              continue;
            }
            const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
            const rawTx: RawTransaction = JSON.parse(buffer.toString());
            transactions.push({
              ...rawTx,
              date: new Date(rawTx.date),
              createdAt: new Date(rawTx.createdAt),
              updatedAt: new Date(rawTx.updatedAt),
              category: rawTx.categoryId ? categoryMap.get(rawTx.categoryId) : undefined,
              paymentMethod: rawTx.paymentMethodId ? paymentMethodMap.get(rawTx.paymentMethodId) : undefined,
            });
          } catch (fetchError: any) {
            console.error(`Error processing Azure transaction blob ${blob.name}:`, fetchError);
             if (fetchError instanceof RestError && fetchError.statusCode === 404) {
                console.warn(`Azure blob ${blob.name} not found during processing, skipping.`);
             } else { /* Potentially rethrow or handle other errors */ }
          }
        }
    }
  } catch (error: any) {
    console.error('Failed to list or process transactions from Azure blob:', error);
    if (error instanceof RestError && error.statusCode === 404 && error.message.includes("ContainerNotFound")) {
        console.warn("Azure container for transactions not found. Returning empty array. The container might need to be created in Azure portal.");
        return [];
    }
    throw new Error(`Could not fetch transactions from Azure Blob store. Original error: ${error.message}`);
  }

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('Add transaction validation error (Azure):', readableErrors);
    throw new Error(`Invalid transaction data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const rawTransaction: RawTransaction = { id, ...validation.data, date: validation.data.date.toISOString(), description: validation.data.description || '', createdAt: now, updatedAt: now };
  const client = await getAzureContainerClient();
  const filePath = `${TRANSACTIONS_DIR}${id}.json`;
  const blockBlobClient = client.getBlockBlobClient(filePath);

  try {
    const content = JSON.stringify(rawTransaction, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), { blobHTTPHeaders: { blobContentType: 'application/json' }});
    revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');

    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = validation.data.categoryId ? allCategories.find(c => c.id === validation.data.categoryId) : undefined;
    const paymentMethod = validation.data.paymentMethodId ? allPaymentMethods.find(pm => pm.id === validation.data.paymentMethodId) : undefined;

    return { ...rawTransaction, date: new Date(rawTransaction.date), createdAt: new Date(rawTransaction.createdAt), updatedAt: new Date(rawTransaction.updatedAt), category, paymentMethod };
  } catch (error: any) {
    console.error('Failed to add transaction to Azure blob:', error);
    throw new Error(`Could not add transaction to Azure blob storage. Original error: ${error.message}`);
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  const client = await getAzureContainerClient();
  const filePath = `${TRANSACTIONS_DIR}${id}.json`;
  const blobClient = client.getBlobClient(filePath);
  let existingRawTx: RawTransaction;

  try {
    const downloadResponse = await blobClient.download(0);
    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Blob ${filePath} for update has no readable stream body.`);
    }
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
    existingRawTx = JSON.parse(buffer.toString());
  } catch (error: any) {
    console.error(`Failed to fetch transaction ${id} from Azure for update:`, error);
    if (error instanceof RestError && error.statusCode === 404) { throw new Error(`Transaction with ID ${id} not found for update.`); }
    throw new Error(`Could not retrieve transaction for update from Azure. Original error: ${error.message}`);
  }
  
  const updatedRawTx: RawTransaction = { ...existingRawTx };

  // Apply updates from data
  if (data.type !== undefined) updatedRawTx.type = data.type;
  if (data.date !== undefined) updatedRawTx.date = data.date.toISOString();
  if (data.amount !== undefined) updatedRawTx.amount = data.amount;
  if (data.description !== undefined) updatedRawTx.description = data.description;


  // Handle type-specific fields based on the FINAL type
  const finalType = updatedRawTx.type;

  if (finalType === 'expense') {
    updatedRawTx.categoryId = data.categoryId !== undefined ? data.categoryId : existingRawTx.categoryId;
    updatedRawTx.paymentMethodId = data.paymentMethodId !== undefined ? data.paymentMethodId : existingRawTx.paymentMethodId;
    updatedRawTx.expenseType = data.expenseType !== undefined ? data.expenseType : existingRawTx.expenseType;
    updatedRawTx.source = undefined; // Expenses don't have a source
  } else if (finalType === 'income') {
    updatedRawTx.categoryId = data.categoryId !== undefined ? data.categoryId : existingRawTx.categoryId;
    updatedRawTx.source = data.source !== undefined ? data.source : existingRawTx.source;
    updatedRawTx.paymentMethodId = undefined; // Income doesn't have payment method
    updatedRawTx.expenseType = undefined;   // Income doesn't have expense type
  }
  updatedRawTx.updatedAt = new Date().toISOString();
  

  // Create a temporary object for validation that matches TransactionInput structure
   const tempForValidation: TransactionInput = {
    type: updatedRawTx.type,
    date: new Date(updatedRawTx.date), // Convert ISO string back to Date for validation
    amount: updatedRawTx.amount,
    description: updatedRawTx.description || '', // Ensure description is a string
    categoryId: updatedRawTx.categoryId,
    paymentMethodId: updatedRawTx.paymentMethodId,
    source: updatedRawTx.source,
    expenseType: updatedRawTx.expenseType,
  };


  const validation = TransactionInputSchema.safeParse(tempForValidation);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('Update transaction validation error after merge (Azure):', readableErrors, "Validated Data:", tempForValidation, "Final Raw to save:", updatedRawTx);
    throw new Error(`Invalid transaction data after update: ${readableErrors || "Validation failed."}`);
  }

  try {
    const blockBlobClient = client.getBlockBlobClient(filePath);
    const content = JSON.stringify(updatedRawTx, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), { blobHTTPHeaders: { blobContentType: 'application/json' }});
    revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');

    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = updatedRawTx.categoryId ? allCategories.find(c => c.id === updatedRawTx.categoryId) : undefined;
    const paymentMethod = updatedRawTx.paymentMethodId ? allPaymentMethods.find(pm => pm.id === updatedRawTx.paymentMethodId) : undefined;

    return { ...updatedRawTx, date: new Date(updatedRawTx.date), createdAt: new Date(updatedRawTx.createdAt), updatedAt: new Date(updatedRawTx.updatedAt), category, paymentMethod };
  } catch (error: any) {
    console.error('Failed to update transaction in Azure blob:', error);
    throw new Error(`Could not update transaction in Azure blob storage. Original error: ${error.message}`);
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  const client = await getAzureContainerClient();
  const filePath = `${TRANSACTIONS_DIR}${id}.json`;
  const blobClient = client.getBlobClient(filePath);
  try {
    await blobClient.deleteIfExists();
    revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete transaction from Azure blob:', error);
    throw new Error(`Could not delete transaction from Azure blob storage. Original error: ${error.message}`);
  }
}


    