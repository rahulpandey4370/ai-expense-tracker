
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
// TRANSACTIONS_DIR is no longer the primary source for active transaction operations.
// const TRANSACTIONS_DIR = 'transactions/';

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
  console.log("Azure Blob Info: Attempting to get Azure Container Client (for categories/payment methods)...");
  if (blobContainerClientInstance) {
    console.log("Azure Blob Info: Returning cached blob container client instance.");
    return blobContainerClientInstance;
  }
  console.log("Azure Blob Info: No cached blob client instance, creating new one.");

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  console.log(`Azure Blob Info: Read AZURE_STORAGE_CONNECTION_STRING. Is present: ${!!connectionString}, Length (if present): ${connectionString?.length}`);
  console.log(`Azure Blob Info: Read AZURE_STORAGE_CONTAINER_NAME: '${containerName}'. Is present: ${!!containerName}, Type: ${typeof containerName}`);

  if (!connectionString) {
    console.error("Azure Blob Critical Error: AZURE_STORAGE_CONNECTION_STRING is not configured.");
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONNECTION_STRING is not configured.");
  }
  if (!containerName || typeof containerName !== 'string' || containerName.trim() === '') {
    console.error(`Azure Blob Critical Error: AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string. Value: '${containerName}'`);
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string. Please check Vercel environment variables.");
  }

  try {
    console.log(`Azure Blob Info: Attempting to create BlobServiceClient... (First 30 chars of CS: ${connectionString.substring(0,30)}...)`);
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    console.log(`Azure Blob Info: BlobServiceClient created. Getting container client for '${containerName}'...`);
    const client = blobServiceClient.getContainerClient(containerName);
    console.log(`Azure Blob Info: Blob container client for '${containerName}' obtained.`);
    blobContainerClientInstance = client;
    return blobContainerClientInstance;
  } catch (error: any) {
    console.error(`Azure Blob CRITICAL Error: Failed to initialize BlobServiceClient or ContainerClient. CS present: ${!!connectionString}, CN: ${containerName}. Error Type: ${error.name}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not connect to Azure Blob Storage. Check configuration. Original error: ${error.message}`);
  }
}

async function ensureAzureBlobFile<T>(filePath: string, defaultData: T[]): Promise<T[]> {
  const client = await getAzureBlobContainerClient();
  const blobClient = client.getBlobClient(filePath);
  console.log(`Azure Blob Info: Ensuring blob file: ${filePath}`);
  try {
    const fileExists = await blobClient.exists();
    if (fileExists) {
      const downloadBlockBlobResponse = await blobClient.download(0);
      if (!downloadBlockBlobResponse.readableStreamBody) throw new Error(`Blob ${filePath} has no readable stream body.`);
      const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
      return JSON.parse(buffer.toString());
    } else {
      const blockBlobClient = client.getBlockBlobClient(filePath);
      const content = JSON.stringify(defaultData, null, 2);
      await blockBlobClient.upload(content, Buffer.byteLength(content), { blobHTTPHeaders: { blobContentType: 'application/json' } });
      console.log(`Azure Blob Info: Created Azure blob ${filePath} with default data.`);
      return defaultData;
    }
  } catch (error: any) {
    console.error(`Azure Blob Error: Error in ensureAzureBlobFile for ${filePath}. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw error;
  }
}

// --- Azure Cosmos DB Client (for Transactions) ---
async function getCosmosDBContainer(): Promise<CosmosContainer> {
  console.log("CosmosDB Info: Attempting to get Cosmos DB container client...");
  if (cosmosContainerInstance) {
    console.log("CosmosDB Info: Returning cached Cosmos DB container instance.");
    return cosmosContainerInstance;
  }
  console.log("CosmosDB Info: No cached Cosmos DB client instance, creating new one.");

  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;
  const containerId = process.env.COSMOS_DB_TRANSACTIONS_CONTAINER_ID;

  console.log(`CosmosDB Info: Read COSMOS_DB_ENDPOINT. Is present: ${!!endpoint}`);
  console.log(`CosmosDB Info: Read COSMOS_DB_KEY. Is present: ${!!key}`);
  console.log(`CosmosDB Info: Read COSMOS_DB_DATABASE_ID: '${databaseId}'. Is present: ${!!databaseId}`);
  console.log(`CosmosDB Info: Read COSMOS_DB_TRANSACTIONS_CONTAINER_ID: '${containerId}'. Is present: ${!!containerId}`);

  if (!endpoint || !key || !databaseId || !containerId) {
    console.error("CosmosDB Critical Error: One or more Cosmos DB environment variables are not configured (COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE_ID, COSMOS_DB_TRANSACTIONS_CONTAINER_ID).");
    throw new Error("Cosmos DB environment variables are not fully configured.");
  }

  try {
    console.log("CosmosDB Info: Creating CosmosClient...");
    const cosmosClient = new CosmosClient({ endpoint, key });
    console.log("CosmosDB Info: CosmosClient created. Getting database...");
    const database = cosmosClient.database(databaseId);
    console.log(`CosmosDB Info: Database '${databaseId}' obtained. Getting container '${containerId}'...`);
    const container = database.container(containerId);
    console.log(`CosmosDB Info: Container '${containerId}' obtained.`);
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
    throw error; // Re-throw to be caught by caller
  }
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
   try {
    return await ensureAzureBlobFile<PaymentMethod>(PAYMENT_METHODS_BLOB_PATH, defaultPaymentMethods);
  } catch (error: any) {
    console.error('Azure Blob Error: Failed to fetch payment methods:', error.message, error.stack);
    throw error; // Re-throw
  }
}

// --- Transaction Functions (Now using Cosmos DB) ---
export async function getTransactions(options?: { limit?: number }): Promise<AppTransaction[]> {
  console.log(`CosmosDB Info (getTransactions): Starting to fetch transactions. Options: ${JSON.stringify(options)}`);
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

  console.log(`CosmosDB Info (getTransactions): Executing query: ${querySpec.query} with params: ${JSON.stringify(querySpec.parameters)}`);
  let processedBlobCount = 0;

  try {
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    console.log(`CosmosDB Info (getTransactions): Fetched ${items.length} raw items from Cosmos DB.`);
    processedBlobCount = items.length;

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

    console.log(`CosmosDB Info (getTransactions): Parsed ${transactions.length} transactions.`);
    if (options?.limit && transactions.length >= options.limit) {
      console.log(`CosmosDB Info (getTransactions): Reached processing limit of ${options.limit}. Processed ${transactions.length} transactions from ${processedBlobCount} fetched items.`);
    }
    return transactions;

  } catch (error: any) {
    console.error('CosmosDB Error (getTransactions): Failed to query transactions.', error.message, error.stack);
    if ((error as any).code === 404) { // More robust check for Cosmos DB specific error structure
        console.warn("CosmosDB Warning (getTransactions): Transactions container or database not found. Returning empty array.");
        return [];
    }
    throw new Error(`Could not fetch transactions from Cosmos DB. Original error: ${error.message}`);
  }
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  console.log("CosmosDB Info (addTransaction): Attempting to add transaction...");
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('CosmosDB Error (addTransaction): Validation error:', readableErrors);
    throw new Error(`Invalid transaction data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();

  // Prepare the item for Cosmos DB. Ensure date is ISO string.
  // Cosmos DB expects `id` to be a string.
  const newItem: RawTransaction = {
    id: id, // Cosmos DB uses 'id' as the item identifier by default
    ...validation.data,
    date: validation.data.date.toISOString(),
    description: validation.data.description || '', // Ensure description is not undefined
    createdAt: now,
    updatedAt: now,
  };

  const container = await getCosmosDBContainer();
  try {
    console.log(`CosmosDB Info (addTransaction): Creating item in Cosmos DB with id: ${id}`);
    const { resource: createdItem } = await container.items.create(newItem);
    if (!createdItem) {
      console.error('CosmosDB Error (addTransaction): Item creation returned no resource.');
      throw new Error('Failed to create transaction in Cosmos DB, no resource returned.');
    }
    console.log(`CosmosDB Info (addTransaction): Successfully created item ${createdItem.id}`);
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');

    // Hydrate for return
    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = validation.data.categoryId ? allCategories.find(c => c.id === validation.data.categoryId) : undefined;
    const paymentMethod = validation.data.paymentMethodId ? allPaymentMethods.find(pm => pm.id === validation.data.paymentMethodId) : undefined;

    return {
      ...createdItem, // createdItem is already like RawTransaction
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
  console.log(`CosmosDB Info (updateTransaction): Attempting to update transaction ${id}...`);
  const container = await getCosmosDBContainer();

  // Fetch the existing item
  let existingItem: RawTransaction;
  try {
    // For containers partitioned by /id, the id itself is the partition key.
    // If you used a different partition key, you'd need to provide it here.
    const { resource } = await container.item(id, id).read<RawTransaction>();
    if (!resource) {
      throw new Error(`Transaction with ID ${id} not found for update.`);
    }
    existingItem = resource;
    console.log(`CosmosDB Info (updateTransaction): Fetched existing item ${id} for update.`);
  } catch (error: any) {
    console.error(`CosmosDB Error (updateTransaction): Failed to fetch transaction ${id} for update. Status: ${error.code}, Message: ${error.message}`, error.stack);
    if (error.code === 404) {
      throw new Error(`Transaction with ID ${id} not found for update.`);
    }
    throw new Error(`Could not retrieve transaction for update. Original error: ${error.message}`);
  }

  // Merge changes and validate. Date needs special handling if it's being updated.
  const updatedRawData = {
    ...existingItem,
    ...data,
    date: data.date ? data.date.toISOString() : existingItem.date, // If new date, convert to ISO
    description: data.description !== undefined ? data.description : existingItem.description,
    updatedAt: new Date().toISOString(),
  };
  
  // Convert RawTransaction-like data to TransactionInput for validation
  const transactionInputForValidation: TransactionInput = {
    type: updatedRawData.type,
    date: new Date(updatedRawData.date), // Convert string date back to Date for validation
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
    console.error('CosmosDB Error (updateTransaction): Validation error:', readableErrors);
    throw new Error(`Invalid transaction data for update: ${readableErrors || "Validation failed."}`);
  }
  
  // Use the validated data (where date is Date object) to form the final RawTransaction for Cosmos
   const finalItemToUpdate: RawTransaction = {
    ...existingItem, // spread existing to keep _rid, _self, _etag, _attachments, _ts
    id: existingItem.id, // Ensure id is explicitly from existing
    type: validation.data.type,
    date: validation.data.date.toISOString(), // Convert validated Date back to ISO string
    amount: validation.data.amount,
    description: validation.data.description || '',
    categoryId: validation.data.categoryId,
    paymentMethodId: validation.data.paymentMethodId,
    source: validation.data.source,
    expenseType: validation.data.expenseType,
    createdAt: existingItem.createdAt, // Keep original createdAt
    updatedAt: new Date().toISOString(),
  };


  try {
    console.log(`CosmosDB Info (updateTransaction): Replacing item ${id} in Cosmos DB.`);
    const { resource: updatedItem } = await container.item(id, id).replace(finalItemToUpdate);
     if (!updatedItem) {
      console.error('CosmosDB Error (updateTransaction): Item replacement returned no resource.');
      throw new Error('Failed to update transaction in Cosmos DB, no resource returned.');
    }
    console.log(`CosmosDB Info (updateTransaction): Successfully updated item ${updatedItem.id}`);
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');

    // Hydrate for return
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
    console.error(`CosmosDB Error (updateTransaction): Failed to update transaction ${id} in Cosmos DB. Status: ${error.code}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not update transaction in Cosmos DB. Original error: ${error.message}`);
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  console.log(`CosmosDB Info (deleteTransaction): Attempting to delete transaction ${id}...`);
  const container = await getCosmosDBContainer();
  try {
    // For containers partitioned by /id, the id itself is the partition key value.
    // If you used a different partition key, you would need to provide that value.
    console.log(`CosmosDB Info (deleteTransaction): Deleting item ${id} from Cosmos DB.`);
    await container.item(id, id).delete();
    console.log(`CosmosDB Info (deleteTransaction): Successfully deleted item ${id}`);
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');
    return { success: true };
  } catch (error: any) {
    console.error(`CosmosDB Error (deleteTransaction): Failed to delete transaction ${id} from Cosmos DB. Status: ${error.code}, Message: ${error.message}`, error.stack);
     if (error.code === 404) {
      console.warn(`CosmosDB Warning (deleteTransaction): Transaction ${id} not found for deletion, considered success.`);
      return { success: true }; // Item not found, so it's effectively deleted.
    }
    throw new Error(`Could not delete transaction from Cosmos DB. Original error: ${error.message}`);
  }
}

    