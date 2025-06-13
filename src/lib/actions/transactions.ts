
'use server';

import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { CosmosClient, type Container as CosmosContainer, type ItemDefinition } from '@azure/cosmos';
import type { AppTransaction, RawTransaction, Category, PaymentMethod, TransactionInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types';
import { defaultCategories, defaultPaymentMethods } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const CATEGORIES_BLOB_PATH = 'internal/data/categories.json';
const PAYMENT_METHODS_BLOB_PATH = 'internal/data/payment-methods.json';
// The DEFAULT_FINWISE_PARTITION_VALUE is no longer needed as we assume partition key is /id

let blobContainerClientInstance: BlobContainerClient;
let cosmosContainerInstance: CosmosContainer;

// --- Azure Blob Storage Helper ---
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

// --- Azure Blob Storage Client (for Categories/PaymentMethods) ---
async function getAzureBlobContainerClient(): Promise<BlobContainerClient> {
  if (blobContainerClientInstance) {
    return blobContainerClientInstance;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString) {
    console.error("Azure Blob Critical Error: AZURE_STORAGE_CONNECTION_STRING is not configured.");
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONNECTION_STRING is not configured.");
  }
  if (!containerName || typeof containerName !== 'string' || containerName.trim() === '') {
    console.error(`Azure Blob Critical Error: AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string. Value: '${containerName}'`);
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string. Please check Vercel environment variables.");
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const client = blobServiceClient.getContainerClient(containerName);
    blobContainerClientInstance = client;
    return blobContainerClientInstance;
  } catch (error: any) {
    console.error(`Azure Blob CRITICAL Error: Failed to initialize BlobServiceClient or ContainerClient. CS present: ${!!connectionString}, CN: ${containerName}. Error Type: ${error.name}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not connect to Azure Blob Storage. Check configuration and credentials. Original error: ${error.message}`);
  }
}

async function ensureAzureBlobFile<T>(filePath: string, defaultData: T[]): Promise<T[]> {
  const client = await getAzureBlobContainerClient();
  const blobClient = client.getBlobClient(filePath);
  try {
    const fileExists = await blobClient.exists();
    if (fileExists) {
      const downloadBlockBlobResponse = await blobClient.download(0);
      if (!downloadBlockBlobResponse.readableStreamBody) {
        console.error(`Azure Blob Error: Blob ${filePath} has no readable stream body.`);
        throw new Error(`Blob ${filePath} has no readable stream body.`);
      }
      const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
      return JSON.parse(buffer.toString());
    } else {
      const blockBlobClient = client.getBlockBlobClient(filePath);
      const content = JSON.stringify(defaultData, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), { blobHTTPHeaders: { blobContentType: 'application/json' } });
      return defaultData;
    }
  } catch (error: any) {
    console.error(`Azure Blob Error: Error in ensureAzureBlobFile for ${filePath}. Status: ${error.statusCode}, Code: ${error.code}, Message: ${error.message}`, error.stack);
    throw error;
  }
}

// --- Azure Cosmos DB Client (for Transactions) ---
async function getCosmosDBContainer(): Promise<CosmosContainer> {
  if (cosmosContainerInstance) {
    return cosmosContainerInstance;
  }

  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;
  const containerId = process.env.COSMOS_DB_TRANSACTIONS_CONTAINER_ID;

  if (!endpoint || !key || !databaseId || !containerId) {
    console.error("CosmosDB Critical Error: One or more Cosmos DB environment variables are not configured (COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE_ID, COSMOS_DB_TRANSACTIONS_CONTAINER_ID).");
    throw new Error("Cosmos DB environment variables are not fully configured.");
  }

  try {
    const cosmosClient = new CosmosClient({ endpoint, key });
    const database = cosmosClient.database(databaseId);
    const container = database.container(containerId);
    cosmosContainerInstance = container;
    return cosmosContainerInstance;
  } catch (error: any) {
    console.error(`CosmosDB CRITICAL Error: Failed to initialize CosmosClient or Container. Error: ${error.message}`, error.stack);
    throw new Error(`Could not connect to Azure Cosmos DB. Check configuration. Original error: ${error.message}`);
  }
}


// --- Category and Payment Method Functions (still using Blob Storage for now) ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  try {
    const allCategories = await ensureAzureBlobFile<Category>(CATEGORIES_BLOB_PATH, defaultCategories);
    if (type) return allCategories.filter(c => c.type === type);
    return allCategories;
  } catch (error: any) {
    console.error('Azure Blob Error: Failed to fetch categories:', error.message, error.stack);
    throw error;
  }
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
   try {
    return await ensureAzureBlobFile<PaymentMethod>(PAYMENT_METHODS_BLOB_PATH, defaultPaymentMethods);
  } catch (error: any) {
    console.error('Azure Blob Error: Failed to fetch payment methods:', error.message, error.stack);
    throw error;
  }
}

// --- Transaction Functions (Now using Cosmos DB) ---
export async function getTransactions(options?: { limit?: number }): Promise<AppTransaction[]> {
  let allCategories: Category[] = [];
  let allPaymentMethods: PaymentMethod[] = [];

  try {
    [allCategories, allPaymentMethods] = await Promise.all([
      getCategories(),
      getPaymentMethods()
    ]);
  } catch (error: any) {
    console.error("CosmosDB Critical Error (getTransactions): Essential lookup data (categories/payment methods from Blob) could not be loaded. Cannot proceed.", error.message, error.stack);
    throw new Error(`Essential lookup data (categories/payment methods from Blob) could not be loaded for transactions. Original error: ${error.message}`);
  }

  const categoryMap = new Map(allCategories.map(c => [c.id, c]));
  const paymentMethodMap = new Map(allPaymentMethods.map(pm => [pm.id, pm]));

  const container = await getCosmosDBContainer();
  const querySpec = {
    query: "SELECT * FROM c ORDER BY c.date DESC",
    parameters: [] as {name: string; value: any}[]
  };

  if (options?.limit) {
    querySpec.query = `SELECT TOP @limit * FROM c ORDER BY c.date DESC`;
    querySpec.parameters.push({ name: "@limit", value: options.limit });
  }
  
  let processedItemCount = 0;

  try {
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    processedItemCount = items.length;

    const transactions: AppTransaction[] = items.map((rawTx: any) => {
      return {
        ...rawTx,
        date: new Date(rawTx.date),
        createdAt: new Date(rawTx.createdAt),
        updatedAt: new Date(rawTx.updatedAt),
        category: rawTx.categoryId ? categoryMap.get(rawTx.categoryId) : undefined,
        paymentMethod: rawTx.paymentMethodId ? paymentMethodMap.get(rawTx.paymentMethodId) : undefined,
      };
    });

    if (options?.limit && transactions.length >= options.limit && transactions.length < processedItemCount) {
      console.log(`CosmosDB Info (getTransactions): Reached processing limit of ${options.limit}. Processed ${transactions.length} transactions from ${processedItemCount} listed items.`);
    }
    return transactions;

  } catch (error: any) {
    console.error('CosmosDB Error (getTransactions): Failed to query transactions.', (error as any).code, error.message, error.stack);
    if ((error as any).code === 404 || (error as any).statusCode === 404) {
        console.warn("CosmosDB Warning (getTransactions): Transactions container or database not found. Returning empty array.");
        return [];
    }
    throw new Error(`Could not fetch transactions from Cosmos DB. Original error: ${error.message}`);
  }
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('CosmosDB Error (addTransaction): Validation error:', readableErrors);
    throw new Error(`Invalid transaction data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();

  // The 'finwise' field is no longer needed as partition key is /id
  const newItem: RawTransaction = {
    id: id,
    ...validation.data,
    date: validation.data.date.toISOString(),
    description: validation.data.description || '',
    createdAt: now,
    updatedAt: now,
  };

  const container = await getCosmosDBContainer();
  try {
    const { resource: createdItem } = await container.items.create(newItem);
    if (!createdItem) {
      console.error('CosmosDB Error (addTransaction): Item creation returned no resource.');
      throw new Error('Failed to create transaction in Cosmos DB, no resource returned.');
    }
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');

    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = validation.data.categoryId ? allCategories.find(c => c.id === validation.data.categoryId) : undefined;
    const paymentMethod = validation.data.paymentMethodId ? allPaymentMethods.find(pm => pm.id === validation.data.paymentMethodId) : undefined;

    return {
      ...createdItem,
      date: new Date(createdItem.date),
      createdAt: new Date(createdItem.createdAt),
      updatedAt: new Date(createdItem.updatedAt),
      category,
      paymentMethod,
    } as AppTransaction;

  } catch (error: any) {
    console.error(`CosmosDB Error (addTransaction): Failed to add transaction ${id} to Cosmos DB. Status: ${error.code}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not add transaction to Cosmos DB. Original error: ${error.message}`);
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    const idDetails = `Received ID: '${id}', Type: ${typeof id}`;
    console.error(`CosmosDB Error (updateTransaction): Invalid or missing transaction ID provided. ${idDetails}`);
    throw new Error(`Invalid or missing transaction ID provided for update. ${idDetails}`);
  }

  const container = await getCosmosDBContainer();
  let existingItem: RawTransaction;

  try {
    // Assuming partition key is now /id, so the second argument to .item() is the item's id.
    console.log(`CosmosDB Debug (updateTransaction): Attempting to read item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'`);
    const { resource } = await container.item(id, id).read<RawTransaction>();
    if (!resource) {
      console.warn(`CosmosDB Warning (updateTransaction): Transaction with ID ${id} (partition: ${id}) not found during read for update.`);
      throw new Error(`Transaction with ID ${id} not found for update.`);
    }
    existingItem = resource;
  } catch (error: any) {
    const statusCodeFromSDK = error.statusCode;
    const errorMessageFromSDK = String(error.message || '').toLowerCase();
    console.error(`CosmosDB Debug (updateTransaction - CATCH BLOCK): Error object received during fetch for ID ${id}, Partition ${id}:`, JSON.stringify(error));
    console.log(`CosmosDB Debug (updateTransaction - CATCH BLOCK): For ID ${id}, Partition ${id}: statusCodeFromSDK = ${statusCodeFromSDK}, errorMessageFromSDK = '${errorMessageFromSDK}'`);
    const isNotFoundByStatus = statusCodeFromSDK === 404;
    const isNotFoundByMessage = errorMessageFromSDK.includes("not found") || errorMessageFromSDK.includes("notfound");
    console.log(`CosmosDB Debug (updateTransaction - CATCH BLOCK): For ID ${id}, Partition ${id}: isNotFoundByStatus = ${isNotFoundByStatus}, isNotFoundByMessage = ${isNotFoundByMessage}`);

    if (isNotFoundByStatus || isNotFoundByMessage) {
      throw new Error(`Transaction with ID ${id} (partition: ${id}) not found for update.`);
    }
    throw new Error(`Could not retrieve transaction for update. Original error: ${error.message}`);
  }

  const updatedRawData = {
    ...existingItem,
    ...data,
    date: data.date ? data.date.toISOString() : existingItem.date,
    description: data.description !== undefined ? data.description : existingItem.description,
    updatedAt: new Date().toISOString(),
    // No 'finwise' field needed here as it's not part of RawTransaction and partition is /id
  };

  const transactionInputForValidation: TransactionInput = {
    type: updatedRawData.type,
    date: new Date(updatedRawData.date),
    amount: updatedRawData.amount,
    description: updatedRawData.description,
    categoryId: updatedRawData.categoryId,
    paymentMethodId: updatedRawData.paymentMethodId,
    source: updatedRawData.source,
    expenseType: updatedRawData.expenseType,
  };

  const validation = TransactionInputSchema.safeParse(transactionInputForValidation);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('CosmosDB Error (updateTransaction): Validation error on updated data:', readableErrors);
    throw new Error(`Invalid transaction data for update: ${readableErrors || "Validation failed."}`);
  }

   const finalItemToUpdate: RawTransaction = { // Ensure this matches RawTransaction, no 'finwise'
    id: existingItem.id, // Critical: ID must be from existingItem
    type: validation.data.type,
    date: validation.data.date.toISOString(),
    amount: validation.data.amount,
    description: validation.data.description || '',
    categoryId: validation.data.categoryId,
    paymentMethodId: validation.data.paymentMethodId,
    source: validation.data.source,
    expenseType: validation.data.expenseType,
    createdAt: existingItem.createdAt, 
    updatedAt: new Date().toISOString(),
  };

  try {
    console.log(`CosmosDB Debug (updateTransaction): Attempting to replace item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'`);
    // Assuming partition key is /id
    const { resource: updatedItem } = await container.item(id, id).replace(finalItemToUpdate);
     if (!updatedItem) {
      console.error('CosmosDB Error (updateTransaction): Item replacement returned no resource.');
      throw new Error('Failed to update transaction in Cosmos DB, no resource returned.');
    }
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');

    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = updatedItem.categoryId ? allCategories.find(c => c.id === updatedItem.categoryId) : undefined;
    const paymentMethod = updatedItem.paymentMethodId ? allPaymentMethods.find(pm => pm.id === updatedItem.paymentMethodId) : undefined;

    return {
      ...updatedItem,
      date: new Date(updatedItem.date),
      createdAt: new Date(updatedItem.createdAt),
      updatedAt: new Date(updatedItem.updatedAt),
      category,
      paymentMethod,
    } as AppTransaction;

  } catch (error: any) {
    console.error(`CosmosDB Error (updateTransaction): Failed to update transaction ${id} (partition: ${id}) in Cosmos DB. Status: ${error.statusCode}, Code: ${error.code}, Message: ${error.message}`, error.stack);
    if (error.statusCode === 404 || String(error.message || '').toLowerCase().includes("not found")) {
        throw new Error(`Transaction with ID ${id} (partition: ${id}) not found during replace operation.`);
    }
    throw new Error(`Could not update transaction in Cosmos DB. Original error: ${error.message}`);
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
   if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    const idDetails = `Received ID: '${id}', Type: ${typeof id}`;
    console.error(`CosmosDB Error (deleteTransaction): Invalid or missing transaction ID provided. ${idDetails}`);
    throw new Error(`Invalid or missing transaction ID provided for delete. ${idDetails}`);
  }
  const container = await getCosmosDBContainer();
  try {
    // Assuming partition key is /id
    console.log(`CosmosDB Debug (deleteTransaction): Attempting to delete item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'`);
    await container.item(id, id).delete();
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');
    return { success: true };
  } catch (error: any) {
    const statusCodeFromSDK = error.statusCode;
    const errorMessageFromSDK = String(error.message || '').toLowerCase();
    console.error(`CosmosDB Debug (deleteTransaction - CATCH BLOCK): Error object received during delete for ID ${id}, Partition ${id}:`, JSON.stringify(error));
    
    if (statusCodeFromSDK === 404 || errorMessageFromSDK.includes("not found") || errorMessageFromSDK.includes("notfound")) {
      console.warn(`CosmosDB Warning (deleteTransaction): Transaction ${id} (partition: ${id}) not found for deletion, considered success.`);
      revalidatePath('/');
      revalidatePath('/transactions');
      revalidatePath('/reports');
      revalidatePath('/yearly-overview');
      revalidatePath('/ai-playground');
      return { success: true }; // Item already deleted, or never existed
    }
    throw new Error(`Could not delete transaction from Cosmos DB. Original error: ${error.message}`);
  }
}

export async function deleteMultipleTransactions(ids: string[]): Promise<{ successCount: number, errorCount: number, errors: {id: string, error: string}[] }> {
  if (!ids || ids.length === 0) {
    return { successCount: 0, errorCount: 0, errors: [] };
  }
  const container = await getCosmosDBContainer();
  let successCount = 0;
  let errorCount = 0;
  const localErrors: {id: string, error: string}[] = [];

  const deletePromises = ids.map(async (id) => {
    if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
        const errMsg = `Invalid ID provided in bulk delete: '${id}' (type: ${typeof id})`;
        console.warn(`CosmosDB Warning (deleteMultipleTransactions): ${errMsg}. Skipping.`);
        return { id, status: 'rejected' as const, reason: errMsg };
    }
    try {
      // Assuming partition key is /id
      console.log(`CosmosDB Debug (deleteMultipleTransactions): Attempting to delete item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'`);
      await container.item(id, id).delete();
      return { id, status: 'fulfilled' as const };
    } catch (error: any) {
      const statusCodeFromSDK = error.statusCode;
      const errorMessageFromSDK = String(error.message || '').toLowerCase();
      console.error(`CosmosDB Error (deleteMultipleTransactions): Failed to delete transaction ${id} (partition: ${id}). Status: ${statusCodeFromSDK}, Code: ${error.code}, Message: ${errorMessageFromSDK}`, error.stack);
      if (statusCodeFromSDK === 404 || errorMessageFromSDK.includes("not found") || errorMessageFromSDK.includes("notfound")) {
        console.warn(`CosmosDB Warning (deleteMultipleTransactions): Transaction ${id} (partition: ${id}) not found during bulk delete, considering it successful.`);
        return { id, status: 'fulfilled' as const, note: 'not_found' }; // Item already deleted
      }
      return { id, status: 'rejected' as const, reason: error.message || 'Unknown error' };
    }
  });

  const results = await Promise.allSettled(deletePromises);

  results.forEach(result => {
    if (result.status === 'fulfilled') {
      if (result.value.status === 'fulfilled') {
        successCount++;
      } else { 
        errorCount++;
        localErrors.push({ id: result.value.id, error: result.value.reason });
      }
    } else { 
      errorCount++;
      const problemId = (result.reason as any)?.id || 'unknown_id_in_promise_all_settled_rejection';
      console.error("CosmosDB Error (deleteMultipleTransactions): A delete promise was unexpectedly rejected.", result.reason);
      localErrors.push({ id: problemId, error: (result.reason as any)?.message || 'A delete operation failed unexpectedly.' });
    }
  });

  if (successCount > 0) {
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');
  }

  return { successCount, errorCount, errors: localErrors };
}
