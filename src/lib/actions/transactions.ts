
'use server';

import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import type { AppTransaction, RawTransaction, Category, PaymentMethod, TransactionInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types';
import { defaultCategories, defaultPaymentMethods } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

let cosmosTransactionsContainerInstance: CosmosContainer;
let blobContainerClientInstance: BlobContainerClient;

// --- Azure Blob Storage Constants and Helpers ---
const INTERNAL_DATA_DIR = 'internal/data/';
const CATEGORIES_BLOB_PATH = `${INTERNAL_DATA_DIR}categories.json`;
const PAYMENT_METHODS_BLOB_PATH = `${INTERNAL_DATA_DIR}payment-methods.json`;

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
    console.error("Azure Critical Error (transactions.ts - Blob Client): AZURE_STORAGE_CONNECTION_STRING is not configured.");
    throw new Error("Azure Storage Connection String for Blob is not configured.");
  }
  if (!containerName) {
    console.error("Azure Critical Error (transactions.ts - Blob Client): AZURE_STORAGE_CONTAINER_NAME is not configured.");
    throw new Error("Azure Storage Container Name for Blob is not configured.");
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    blobContainerClientInstance = blobServiceClient.getContainerClient(containerName);
    return blobContainerClientInstance;
  } catch (error: any) {
    console.error("Azure CRITICAL Error (transactions.ts - Blob Client): Failed to initialize BlobServiceClient or ContainerClient.", error.message, error.stack);
    if (error.message && error.message.toLowerCase().includes("invalid url")) {
        console.error("Azure CRITICAL Error (transactions.ts - Blob Client): The Azure Storage Connection String appears to be malformed.");
    }
    throw new Error(`Could not connect to Azure Blob Storage. Original error: ${error.message}`);
  }
}

async function ensureAzureBlobFile<T>(filePath: string, defaultContent: T[]): Promise<T[]> {
  const client = await getAzureBlobContainerClient();
  const blobClient = client.getBlobClient(filePath);

  try {
    console.log(`Azure Info (ensureAzureBlobFile): Attempting to download blob: ${filePath}`);
    const downloadBlockBlobResponse = await blobClient.download(0);
    if (!downloadBlockBlobResponse.readableStreamBody) {
      console.warn(`Azure Warning (ensureAzureBlobFile): Blob ${filePath} has no readable stream body. Attempting to create with default content.`);
      throw new RestError("Blob has no readable stream body", undefined, 404); // Simulate 404 to trigger creation
    }
    const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    console.log(`Azure Info (ensureAzureBlobFile): Successfully downloaded blob: ${filePath}`);
    return JSON.parse(buffer.toString()) as T[];
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) {
      console.warn(`Azure Warning (ensureAzureBlobFile): Blob ${filePath} not found. Creating with default content.`);
      const blockBlobClient = client.getBlockBlobClient(filePath);
      const content = JSON.stringify(defaultContent, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      console.log(`Azure Info (ensureAzureBlobFile): Successfully created blob ${filePath} with default content.`);
      return defaultContent;
    }
    console.error(`Azure Error (ensureAzureBlobFile): Failed to ensure/download blob ${filePath}. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not access or create blob file ${filePath}. Original error: ${error.message}`);
  }
}

// --- Category and Payment Method Functions (Now using Azure Blob Storage) ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  console.log("Azure Info (getCategories): Fetching categories from Azure Blob Storage.");
  try {
    const allCategories = await ensureAzureBlobFile<Category>(CATEGORIES_BLOB_PATH, defaultCategories);
    if (type) {
      return allCategories.filter(c => c.type === type);
    }
    return allCategories;
  } catch (error: any) {
    console.error("Azure Error (getCategories): Could not fetch categories from Blob. Falling back to static defaults. Error:", error.message);
    const staticCategories = [...defaultCategories];
    if (type) {
      return staticCategories.filter(c => c.type === type);
    }
    return staticCategories;
  }
}

export async function addCategory(data: Omit<Category, 'id'>): Promise<Category> {
  const allCategories = await getCategories();
  if (allCategories.some(c => c.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error(`Category "${data.name}" already exists.`);
  }

  const newCategory: Category = { id: cuid(), ...data };
  const updatedCategories = [...allCategories, newCategory];

  const client = await getAzureBlobContainerClient();
  const blockBlobClient = client.getBlockBlobClient(CATEGORIES_BLOB_PATH);
  await blockBlobClient.upload(JSON.stringify(updatedCategories, null, 2), Buffer.byteLength(JSON.stringify(updatedCategories, null, 2)));

  revalidatePath('/settings');
  revalidatePath('/transactions');
  return newCategory;
}

export async function deleteCategory(id: string): Promise<{ success: boolean }> {
  const allCategories = await getCategories();
  const updatedCategories = allCategories.filter(c => c.id !== id);

  if (allCategories.length === updatedCategories.length) {
    throw new Error("Category not found.");
  }

  const client = await getAzureBlobContainerClient();
  const blockBlobClient = client.getBlockBlobClient(CATEGORIES_BLOB_PATH);
  await blockBlobClient.upload(JSON.stringify(updatedCategories, null, 2), Buffer.byteLength(JSON.stringify(updatedCategories, null, 2)));
  
  revalidatePath('/settings');
  revalidatePath('/transactions');
  return { success: true };
}


export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  console.log("Azure Info (getPaymentMethods): Fetching payment methods from Azure Blob Storage.");
  try {
    return await ensureAzureBlobFile<PaymentMethod>(PAYMENT_METHODS_BLOB_PATH, defaultPaymentMethods);
  } catch (error: any) {
    console.error("Azure Error (getPaymentMethods): Could not fetch payment methods from Blob. Falling back to static defaults. Error:", error.message);
    return [...defaultPaymentMethods];
  }
}

export async function addPaymentMethod(data: Omit<PaymentMethod, 'id'>): Promise<PaymentMethod> {
  const allMethods = await getPaymentMethods();
  if (allMethods.some(pm => pm.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error(`Payment method "${data.name}" already exists.`);
  }

  const newMethod: PaymentMethod = { id: cuid(), ...data };
  const updatedMethods = [...allMethods, newMethod];
  
  const client = await getAzureBlobContainerClient();
  const blockBlobClient = client.getBlockBlobClient(PAYMENT_METHODS_BLOB_PATH);
  await blockBlobClient.upload(JSON.stringify(updatedMethods, null, 2), Buffer.byteLength(JSON.stringify(updatedMethods, null, 2)));
  
  revalidatePath('/settings');
  revalidatePath('/transactions');
  return newMethod;
}

export async function deletePaymentMethod(id: string): Promise<{ success: boolean }> {
  const allMethods = await getPaymentMethods();
  const updatedMethods = allMethods.filter(pm => pm.id !== id);

  if (allMethods.length === updatedMethods.length) {
    throw new Error("Payment method not found.");
  }
  
  const client = await getAzureBlobContainerClient();
  const blockBlobClient = client.getBlockBlobClient(PAYMENT_METHODS_BLOB_PATH);
  await blockBlobClient.upload(JSON.stringify(updatedMethods, null, 2), Buffer.byteLength(JSON.stringify(updatedMethods, null, 2)));

  revalidatePath('/settings');
  revalidatePath('/transactions');
  return { success: true };
}


// --- Azure Cosmos DB Client Helpers for Transactions ---
async function getCosmosClientAndDb() {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;

  if (!endpoint || !key || !databaseId) {
    console.error("CosmosDB Critical Error: Core Cosmos DB environment variables are not configured (ENDPOINT, KEY, DATABASE_ID).");
    throw new Error("Cosmos DB core environment variables are not fully configured.");
  }
  const cosmosClient = new CosmosClient({ endpoint, key });
  const database = cosmosClient.database(databaseId);
  return { database };
}

async function getCosmosDBTransactionsContainer(): Promise<CosmosContainer> {
  if (cosmosTransactionsContainerInstance) {
    return cosmosTransactionsContainerInstance;
  }
  const { database } = await getCosmosClientAndDb();
  const containerId = process.env.COSMOS_DB_TRANSACTIONS_CONTAINER_ID;
  if (!containerId) {
    console.error("CosmosDB Critical Error: COSMOS_DB_TRANSACTIONS_CONTAINER_ID is not configured.");
    throw new Error("Cosmos DB Transactions container ID is not configured.");
  }
  cosmosTransactionsContainerInstance = database.container(containerId);
  return cosmosTransactionsContainerInstance;
}


// --- Transaction Functions (Using Cosmos DB for transactions, Blob for lookups) ---
export async function getTransactions(options?: { limit?: number }): Promise<AppTransaction[]> {
  let allCategories: Category[] = [];
  let allPaymentMethods: PaymentMethod[] = [];

  try {
    // Fetch lookup data from Azure Blob Storage (with fallback to static)
    allCategories = await getCategories();
    allPaymentMethods = await getPaymentMethods();
  } catch (error: any) {
    console.error("Azure Critical Error (getTransactions): Essential lookup data (categories/payment methods from Azure Blob Storage) could not be loaded. Cannot proceed.", error.message, error.stack);
    throw new Error(`Essential lookup data (categories/payment methods from Azure Blob Storage) could not be loaded for transactions. Original error: ${error.message}`);
  }

  const categoryMap = new Map(allCategories.map(c => [c.id, c]));
  const paymentMethodMap = new Map(allPaymentMethods.map(pm => [pm.id, pm]));

  const container = await getCosmosDBTransactionsContainer();
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

  const newItem: RawTransaction = {
    id: id,
    ...validation.data,
    date: validation.data.date.toISOString(), 
    description: validation.data.description || '', 
    createdAt: now,
    updatedAt: now,
  };

  const container = await getCosmosDBTransactionsContainer();
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

    // Use the getCategories and getPaymentMethods that now fetch from Blob (or static fallback)
    const allCategories = await getCategories();
    const allPaymentMethods = await getPaymentMethods();
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
  console.log(`CosmosDB Debug (updateTransaction): Received update request for ID: '${id}'`);
  if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    const idDetails = `Received ID: '${id}', Type: ${typeof id}`;
    console.error(`CosmosDB Error (updateTransaction): Invalid or missing transaction ID provided. ${idDetails}`);
    throw new Error(`Invalid or missing transaction ID provided for update. ${idDetails}`);
  }

  const container = await getCosmosDBTransactionsContainer();
  let existingItem: RawTransaction;

  try {
    console.log(`CosmosDB Debug (updateTransaction): Attempting to read item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'`);
    const { resource } = await container.item(id, id).read<RawTransaction>();
    if (!resource) {
      console.warn(`CosmosDB Warning (updateTransaction): Transaction with ID ${id} (partition: ${id}) not found during read for update.`);
      throw new Error(`Transaction with ID ${id} not found for update.`);
    }
    existingItem = resource;
    console.log(`CosmosDB Debug (updateTransaction): Successfully read item ID '${id}'. Etag: ${existingItem._etag}`);
  } catch (error: any) {
    const statusCodeFromSDK = error.statusCode;
    const errorMessageFromSDK = String(error.message || '').toLowerCase();
    console.error(`CosmosDB Debug (updateTransaction - CATCH BLOCK): Error object received during fetch for ID ${id}, Partition ${id}:`, JSON.stringify(error));
    console.log(`CosmosDB Debug (updateTransaction - CATCH BLOCK): For ID ${id}, Partition ${id}: statusCodeFromSDK = ${statusCodeFromSDK}, errorMessageFromSDK = '${errorMessageFromSDK}'`);
    
    const isNotFoundByStatus = statusCodeFromSDK === 404;
    const isNotFoundByMessage = errorMessageFromSDK.includes("not found") || errorMessageFromSDK.includes("notfound");
    console.log(`CosmosDB Debug (updateTransaction - CATCH BLOCK): For ID ${id}, Partition ${id}: isNotFoundByStatus = ${isNotFoundByStatus}, isNotFoundByMessage = ${isNotFoundByMessage}`);

    if (isNotFoundByStatus || isNotFoundByMessage) {
      throw new Error(`Transaction with ID ${id} not found for update.`);
    }
    throw new Error(`Could not retrieve transaction for update. Original error: ${error.message}`);
  }

  const updatedRawData = {
    ...existingItem,
    ...data,
    date: data.date ? data.date.toISOString() : existingItem.date, 
    description: data.description !== undefined ? data.description : existingItem.description,
    isSplit: data.isSplit !== undefined ? data.isSplit : existingItem.isSplit,
    updatedAt: new Date().toISOString(),
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
    isSplit: updatedRawData.isSplit,
  };

  const validation = TransactionInputSchema.safeParse(transactionInputForValidation);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('CosmosDB Error (updateTransaction): Validation error on updated data:', readableErrors);
    throw new Error(`Invalid transaction data for update: ${readableErrors || "Validation failed."}`);
  }

   const finalItemToUpdate: RawTransaction = { 
    id: existingItem.id, 
    type: validation.data.type,
    date: validation.data.date.toISOString(),
    amount: validation.data.amount,
    description: validation.data.description || '',
    categoryId: validation.data.categoryId,
    paymentMethodId: validation.data.paymentMethodId,
    source: validation.data.source,
    expenseType: validation.data.expenseType,
    isSplit: validation.data.isSplit,
    createdAt: existingItem.createdAt, 
    updatedAt: new Date().toISOString(),
    _rid: existingItem._rid,
    _self: existingItem._self,
    _etag: existingItem._etag,
    _attachments: existingItem._attachments,
    _ts: existingItem._ts,
  };

  try {
    console.log(`CosmosDB Debug (updateTransaction): Attempting to replace item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'. Etag for replace: ${finalItemToUpdate._etag}`);
    const { resource: updatedItem } = await container.item(id, id).replace(finalItemToUpdate, { accessCondition: { type: "IfMatch", condition: finalItemToUpdate._etag } });
     if (!updatedItem) {
      console.error('CosmosDB Error (updateTransaction): Item replacement returned no resource.');
      throw new Error('Failed to update transaction in Cosmos DB, no resource returned.');
    }
    console.log(`CosmosDB Debug (updateTransaction): Successfully replaced item ID '${id}'. New Etag: ${updatedItem._etag}`);
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');

    const allCategories = await getCategories();
    const allPaymentMethods = await getPaymentMethods();
    const category = updatedItem.categoryId ? allCategories.find(c => c.id === updatedItem.categoryId) : undefined;
    const paymentMethod = updatedItem.paymentMethodId ? allPaymentMethods.find(pm => pm.id === updatedItem.paymentMethodId) : undefined;

    return {
      ...updatedItem,
      date: new Date(updatedItem.date), 
      createdAt: new Date(updatedItem.createdAt),
      updatedAt: new Date(updatedItem. updatedAt),
      category,
      paymentMethod,
    } as AppTransaction;

  } catch (error: any) {
    console.error(`CosmosDB Error (updateTransaction): Failed to update transaction ${id} (partition: ${id}) in Cosmos DB. Status: ${error.statusCode}, Code: ${error.code}, Message: ${error.message}`, error.stack);
    if (error.statusCode === 404 || String(error.message || '').toLowerCase().includes("not found")) {
        throw new Error(`Transaction with ID ${id} (partition: ${id}) not found during replace operation.`);
    }
    if (error.statusCode === 412) { 
      console.error(`CosmosDB Error (updateTransaction): Etag mismatch for transaction ${id}. Data may have been modified by another process.`);
      throw new Error(`Failed to update transaction ${id} due to a data conflict (etag mismatch). Please refresh and try again.`);
    }
    throw new Error(`Could not update transaction in Cosmos DB. Original error: ${error.message}`);
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
   console.log(`CosmosDB Debug (deleteTransaction): Received delete request for ID: '${id}'`);
   if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    const idDetails = `Received ID: '${id}', Type: ${typeof id}`;
    console.error(`CosmosDB Error (deleteTransaction): Invalid or missing transaction ID provided. ${idDetails}`);
    throw new Error(`Invalid or missing transaction ID provided for delete. ${idDetails}`);
  }
  const container = await getCosmosDBTransactionsContainer();
  try {
    console.log(`CosmosDB Debug (deleteTransaction): Attempting to delete item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'`);
    await container.item(id, id).delete();
    console.log(`CosmosDB Debug (deleteTransaction): Successfully deleted item ID '${id}'.`);
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
      return { success: true }; 
    }
    throw new Error(`Could not delete transaction from Cosmos DB. Original error: ${error.message}`);
  }
}

export async function deleteMultipleTransactions(ids: string[]): Promise<{ successCount: number, errorCount: number, errors: {id: string, error: string}[] }> {
  if (!ids || ids.length === 0) {
    return { successCount: 0, errorCount: 0, errors: [] };
  }
  const container = await getCosmosDBTransactionsContainer();
  let successCount = 0;
  let errorCount = 0;
  const localErrors: {id: string, error: string}[] = [];

  const deletePromises = ids.map(async (id) => {
    console.log(`CosmosDB Debug (deleteMultipleTransactions): Processing ID: '${id}' for deletion.`);
    if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
        const errMsg = `Invalid ID provided in bulk delete: '${id}' (type: ${typeof id})`;
        console.warn(`CosmosDB Warning (deleteMultipleTransactions): ${errMsg}. Skipping.`);
        return { id, status: 'rejected' as const, reason: errMsg };
    }
    try {
      console.log(`CosmosDB Debug (deleteMultipleTransactions): Attempting to delete item. Item ID: '${id}', Partition Key Value (should be same as ID): '${id}'`);
      await container.item(id, id).delete();
      console.log(`CosmosDB Debug (deleteMultipleTransactions): Successfully deleted item ID '${id}'.`);
      return { id, status: 'fulfilled' as const };
    } catch (error: any) {
      const statusCodeFromSDK = error.statusCode;
      const errorMessageFromSDK = String(error.message || '').toLowerCase();
      console.error(`CosmosDB Error (deleteMultipleTransactions): Failed to delete transaction ${id} (partition: ${id}). Status: ${statusCodeFromSDK}, Code: ${error.code}, Message: ${errorMessageFromSDK}`, error.stack);
      if (statusCodeFromSDK === 404 || errorMessageFromSDK.includes("not found") || errorMessageFromSDK.includes("notfound")) {
        console.warn(`CosmosDB Warning (deleteMultipleTransactions): Transaction ${id} (partition: ${id}) not found during bulk delete, considering it successful.`);
        return { id, status: 'fulfilled' as const, note: 'not_found' }; 
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

export async function ensureCoreCosmosDBContainersExist() {
    try {
        const { database } = await getCosmosClientAndDb();
        const transactionsContainerId = process.env.COSMOS_DB_TRANSACTIONS_CONTAINER_ID;
        
        if (!transactionsContainerId) {
            throw new Error("Core Cosmos DB container ID for Transactions is not defined in environment variables.");
        }

        await database.containers.createIfNotExists({ id: transactionsContainerId, partitionKey: { paths: ["/id"] } });
        console.log(`CosmosDB Info: Container '${transactionsContainerId}' for transactions ensured.`);
        
    } catch (error: any) {
        console.error("CosmosDB Error: Failed to ensure core containers exist.", error.message, error.stack);
    }
}