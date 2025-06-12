
'use server';

import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
import type { AppTransaction, RawTransaction, Category, PaymentMethod, TransactionInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types';
import { defaultCategories, defaultPaymentMethods } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const CATEGORIES_BLOB_PATH = 'internal/data/categories.json';
const PAYMENT_METHODS_BLOB_PATH = 'internal/data/payment-methods.json';
// TRANSACTIONS_DIR is no longer the primary source for getTransactions but might be used for migration or backup.
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

// --- Transaction Functions (Now using Cosmos DB for getTransactions) ---
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
    query: "SELECT * FROM c ORDER BY c.date DESC", // Basic query, fetches all and sorts by date
    parameters: [] as {name: string; value: any}[]
  };

  // If a limit is provided, adjust the query. Cosmos DB uses TOP for limiting.
  if (options?.limit) {
    querySpec.query = `SELECT TOP @limit * FROM c ORDER BY c.date DESC`;
    querySpec.parameters.push({ name: "@limit", value: options.limit });
  }
  
  console.log(`CosmosDB Info (getTransactions): Executing query: ${querySpec.query} with params: ${JSON.stringify(querySpec.parameters)}`);

  try {
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    console.log(`CosmosDB Info (getTransactions): Fetched ${items.length} raw items from Cosmos DB.`);

    const transactions: AppTransaction[] = items.map((rawTx: any) => { // Assuming items are RawTransaction-like
      return {
        ...rawTx,
        date: new Date(rawTx.date), // Ensure date is a Date object
        createdAt: new Date(rawTx.createdAt),
        updatedAt: new Date(rawTx.updatedAt),
        category: rawTx.categoryId ? categoryMap.get(rawTx.categoryId) : undefined,
        paymentMethod: rawTx.paymentMethodId ? paymentMethodMap.get(rawTx.paymentMethodId) : undefined,
      };
    });
    
    // Sorting is handled by Cosmos DB query's ORDER BY.
    // If further client-side sorting/filtering after limiting is needed, it would go here.
    console.log(`CosmosDB Info (getTransactions): Parsed ${transactions.length} transactions.`);
    return transactions;

  } catch (error: any) {
    console.error('CosmosDB Error (getTransactions): Failed to query transactions.', error.message, error.stack);
    // Check for common Cosmos DB errors (e.g., container not found, auth issues)
    if (error.code === 404) {
        console.warn("CosmosDB Warning (getTransactions): Transactions container or database not found. Returning empty array.");
        return [];
    }
    throw new Error(`Could not fetch transactions from Cosmos DB. Original error: ${error.message}`);
  }
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  console.log("CosmosDB Info (addTransaction): Attempting to add transaction...");
  // TODO: Rewrite for Cosmos DB
  // This function needs to be rewritten to insert a document into Cosmos DB.
  // 1. Validate input with TransactionInputSchema.
  // 2. Create a new RawTransaction-like object (ensure date is ISO string).
  // 3. Use `container.items.create(newItem)` to add to Cosmos DB.
  // 4. Revalidate paths.
  // 5. Return the AppTransaction (hydrated with category/paymentMethod objects).
  console.error("CosmosDB Error: addTransaction function is not yet implemented for Cosmos DB.");
  throw new Error("addTransaction function is not yet implemented for Cosmos DB.");

  // Placeholder for original blob logic (commented out)
  /*
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) { ... }
  const id = cuid();
  const now = new Date().toISOString();
  const rawTransaction: RawTransaction = { id, ...validation.data, date: validation.data.date.toISOString(), description: validation.data.description || '', createdAt: now, updatedAt: now };
  const client = await getAzureBlobContainerClient(); // Needs to be specific for blob if kept for other things
  const filePath = `${TRANSACTIONS_DIR}${id}.json`;
  const blockBlobClient = client.getBlockBlobClient(filePath);
  try {
    const content = JSON.stringify(rawTransaction, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), { blobHTTPHeaders: { blobContentType: 'application/json' } });
    revalidatePath('/'); revalidatePath('/transactions'); revalidatePath('/reports'); revalidatePath('/yearly-overview'); revalidatePath('/ai-playground');
    const [allCategories, allPaymentMethods] = await Promise.all([ getCategories(), getPaymentMethods() ]);
    const category = validation.data.categoryId ? allCategories.find(c => c.id === validation.data.categoryId) : undefined;
    const paymentMethod = validation.data.paymentMethodId ? allPaymentMethods.find(pm => pm.id === validation.data.paymentMethodId) : undefined;
    return { ...rawTransaction, date: new Date(rawTransaction.date), createdAt: new Date(rawTransaction.createdAt), updatedAt: new Date(rawTransaction.updatedAt), category, paymentMethod };
  } catch (error: any) { ... }
  */
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  console.log(`CosmosDB Info (updateTransaction): Attempting to update transaction ${id}...`);
  // TODO: Rewrite for Cosmos DB
  // This function needs to be rewritten to update/replace a document in Cosmos DB.
  // 1. Fetch the existing item by ID: `container.item(id, partitionKeyValue_if_any).read()`.
  // 2. Merge changes.
  // 3. Validate the merged data.
  // 4. Use `container.item(id, partitionKeyValue_if_any).replace(updatedItem)`
  // 5. Revalidate paths.
  // 6. Return the updated AppTransaction.
  console.error("CosmosDB Error: updateTransaction function is not yet implemented for Cosmos DB.");
  throw new Error("updateTransaction function is not yet implemented for Cosmos DB.");
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  console.log(`CosmosDB Info (deleteTransaction): Attempting to delete transaction ${id}...`);
  // TODO: Rewrite for Cosmos DB
  // This function needs to be rewritten to delete a document from Cosmos DB.
  // 1. Use `container.item(id, partitionKeyValue_if_any).delete()`.
  //    Note: You'll need a partition key value if your container is partitioned and you're not using a cross-partition query to find the item first.
  //    For simplicity, if you don't have many distinct values for partitioning (e.g. by year or type), you might choose a single partition key value for all transactions or not use one if data size is small.
  //    If your transaction ID `id` is unique across the container, that's good.
  // 2. Revalidate paths.
  console.error("CosmosDB Error: deleteTransaction function is not yet implemented for Cosmos DB.");
  throw new Error("deleteTransaction function is not yet implemented for Cosmos DB.");
}
