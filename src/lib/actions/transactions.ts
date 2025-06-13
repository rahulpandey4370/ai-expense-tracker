
'use server';

import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob'; // Keep for now if other parts might use it
import { CosmosClient, type Container as CosmosContainer, type ItemDefinition } from '@azure/cosmos';
import type { AppTransaction, RawTransaction, Category, PaymentMethod, TransactionInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types';
import { defaultCategories, defaultPaymentMethods } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

// Constants for Blob Storage paths (will become obsolete for categories/pm if fully migrated)
// const CATEGORIES_BLOB_PATH = 'internal/data/categories.json';
// const PAYMENT_METHODS_BLOB_PATH = 'internal/data/payment-methods.json';

let blobContainerClientInstance: BlobContainerClient; // May be removed if Blob is no longer used at all
let cosmosTransactionsContainerInstance: CosmosContainer;
let cosmosCategoriesContainerInstance: CosmosContainer;
let cosmosPaymentMethodsContainerInstance: CosmosContainer;


// --- Azure Blob Storage Helper (May become obsolete or move if Blob is fully phased out) ---
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

// --- Azure Blob Storage Client (May become obsolete) ---
async function getAzureBlobContainerClient(): Promise<BlobContainerClient> {
  if (blobContainerClientInstance) {
    return blobContainerClientInstance;
  }
  // ... (implementation remains, but its usage for categories/PMs will be removed)
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

// --- Azure Cosmos DB Client Helpers ---
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

async function getCosmosDBCategoriesContainer(): Promise<CosmosContainer> {
  if (cosmosCategoriesContainerInstance) {
    return cosmosCategoriesContainerInstance;
  }
  const { database } = await getCosmosClientAndDb();
  const containerId = process.env.COSMOS_DB_CATEGORIES_CONTAINER_ID;
  if (!containerId) {
    console.error("CosmosDB Critical Error: COSMOS_DB_CATEGORIES_CONTAINER_ID is not configured.");
    throw new Error("Cosmos DB Categories container ID is not configured.");
  }
  cosmosCategoriesContainerInstance = database.container(containerId);
  return cosmosCategoriesContainerInstance;
}

async function getCosmosDBPaymentMethodsContainer(): Promise<CosmosContainer> {
  if (cosmosPaymentMethodsContainerInstance) {
    return cosmosPaymentMethodsContainerInstance;
  }
  const { database } = await getCosmosClientAndDb();
  const containerId = process.env.COSMOS_DB_PAYMENT_METHODS_CONTAINER_ID;
  if (!containerId) {
    console.error("CosmosDB Critical Error: COSMOS_DB_PAYMENT_METHODS_CONTAINER_ID is not configured.");
    throw new Error("Cosmos DB Payment Methods container ID is not configured.");
  }
  cosmosPaymentMethodsContainerInstance = database.container(containerId);
  return cosmosPaymentMethodsContainerInstance;
}


// --- Category and Payment Method Functions (Now using Cosmos DB) ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  const container = await getCosmosDBCategoriesContainer();
  const querySpec = { query: "SELECT * FROM c" };
  
  try {
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    if (items.length === 0) {
      // Seed default categories if container is empty
      console.log("CosmosDB Info (getCategories): Categories container is empty. Seeding default categories...");
      const seededCategories: Category[] = [];
      for (const defaultCat of defaultCategories) {
        const newCat = { ...defaultCat, id: cuid() }; // Ensure unique ID for Cosmos
        await container.items.create(newCat);
        seededCategories.push(newCat);
      }
      console.log(`CosmosDB Info (getCategories): Seeded ${seededCategories.length} categories.`);
      if (type) return seededCategories.filter(c => c.type === type);
      return seededCategories;
    }
    const allCategories = items as Category[];
    if (type) return allCategories.filter(c => c.type === type);
    return allCategories;
  } catch (error: any) {
    console.error('CosmosDB Error (getCategories): Failed to fetch or seed categories.', error.code, error.message, error.stack);
    if (error.code === 404 && error.message.includes("Resource Not Found") && error.message.includes("Container")) {
       console.error(`CosmosDB Critical Error (getCategories): Container for categories not found. Please ensure a container with ID '${process.env.COSMOS_DB_CATEGORIES_CONTAINER_ID}' (partition key /id) exists in database '${process.env.COSMOS_DB_DATABASE_ID}'. Falling back to local defaults.`);
       if (type) return defaultCategories.filter(c => c.type === type);
       return defaultCategories; // Fallback to prevent app crash, but data won't be persisted.
    }
    throw new Error(`Could not fetch categories from Cosmos DB. Original error: ${error.message}`);
  }
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const container = await getCosmosDBPaymentMethodsContainer();
  const querySpec = { query: "SELECT * FROM c" };
  try {
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    if (items.length === 0) {
      // Seed default payment methods if container is empty
      console.log("CosmosDB Info (getPaymentMethods): Payment methods container is empty. Seeding default payment methods...");
      const seededPaymentMethods: PaymentMethod[] = [];
      for (const defaultPM of defaultPaymentMethods) {
        const newPM = { ...defaultPM, id: cuid() }; // Ensure unique ID for Cosmos
        await container.items.create(newPM);
        seededPaymentMethods.push(newPM);
      }
      console.log(`CosmosDB Info (getPaymentMethods): Seeded ${seededPaymentMethods.length} payment methods.`);
      return seededPaymentMethods;
    }
    return items as PaymentMethod[];
  } catch (error: any) {
    console.error('CosmosDB Error (getPaymentMethods): Failed to fetch or seed payment methods.', error.code, error.message, error.stack);
     if (error.code === 404 && error.message.includes("Resource Not Found") && error.message.includes("Container")) {
       console.error(`CosmosDB Critical Error (getPaymentMethods): Container for payment methods not found. Please ensure a container with ID '${process.env.COSMOS_DB_PAYMENT_METHODS_CONTAINER_ID}' (partition key /id) exists in database '${process.env.COSMOS_DB_DATABASE_ID}'. Falling back to local defaults.`);
       return defaultPaymentMethods; // Fallback
    }
    throw new Error(`Could not fetch payment methods from Cosmos DB. Original error: ${error.message}`);
  }
}

// --- Transaction Functions (Using Cosmos DB) ---
export async function getTransactions(options?: { limit?: number }): Promise<AppTransaction[]> {
  let allCategories: Category[] = [];
  let allPaymentMethods: PaymentMethod[] = [];

  try {
    // These will now fetch from Cosmos DB
    [allCategories, allPaymentMethods] = await Promise.all([
      getCategories(),
      getPaymentMethods()
    ]);
  } catch (error: any) {
    // Log the error but try to continue, or rethrow if critical
    console.error("CosmosDB Critical Error (getTransactions): Essential lookup data (categories/payment methods from Cosmos DB) could not be loaded. This may impact transaction display.", error.message, error.stack);
    // Depending on strictness, you might throw here or attempt to proceed with empty/default lookups
    // For now, let's proceed, and transactions might appear without full category/PM details if lookups failed.
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
    createdAt: existingItem.createdAt, 
    updatedAt: new Date().toISOString(),
    // Retain system properties for optimistic concurrency with etag
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
    if (error.statusCode === 412) { // Precondition Failed (etag mismatch)
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
      revalidatePath('/'); // Still revalidate as the state should reflect it's gone
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
      // The value here is what our async function inside map returned
      if (result.value.status === 'fulfilled') {
        successCount++;
      } else { // This means our async function returned { status: 'rejected', ... }
        errorCount++;
        localErrors.push({ id: result.value.id, error: result.value.reason });
      }
    } else { // This means the promise from map itself rejected (less likely here with individual try/catches)
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

// Helper to ensure Cosmos DB containers exist. Call during app startup or before first use if necessary.
export async function ensureCoreCosmosDBContainersExist() {
    try {
        const { database } = await getCosmosClientAndDb();
        const transactionsContainerId = process.env.COSMOS_DB_TRANSACTIONS_CONTAINER_ID;
        const categoriesContainerId = process.env.COSMOS_DB_CATEGORIES_CONTAINER_ID;
        const paymentMethodsContainerId = process.env.COSMOS_DB_PAYMENT_METHODS_CONTAINER_ID;

        if (!transactionsContainerId || !categoriesContainerId || !paymentMethodsContainerId) {
            throw new Error("One or more core Cosmos DB container IDs (Transactions, Categories, PaymentMethods) are not defined in environment variables.");
        }

        await database.containers.createIfNotExists({ id: transactionsContainerId, partitionKey: { paths: ["/id"] } });
        console.log(`CosmosDB Info: Container '${transactionsContainerId}' for transactions ensured.`);
        
        await database.containers.createIfNotExists({ id: categoriesContainerId, partitionKey: { paths: ["/id"] } });
        console.log(`CosmosDB Info: Container '${categoriesContainerId}' for categories ensured.`);

        await database.containers.createIfNotExists({ id: paymentMethodsContainerId, partitionKey: { paths: ["/id"] } });
        console.log(`CosmosDB Info: Container '${paymentMethodsContainerId}' for payment methods ensured.`);

    } catch (error: any)
     {
        console.error("CosmosDB Error: Failed to ensure core containers exist.", error.message, error.stack);
    }
}
// Example: Call this during app initialization if needed, e.g., in a global layout server component (though `use server` actions might not be the best place for a startup script like this)
// ensureCoreCosmosDBContainersExist();
