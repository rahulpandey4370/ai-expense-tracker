
import { BlobServiceClient, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
import { config } from 'dotenv';
import type { RawTransaction } from '@/lib/types'; // Assuming RawTransaction is the structure in blobs

// Load environment variables from .env file
config();

const TRANSACTIONS_BLOB_DIR = 'transactions/';
// No longer need DEFAULT_FINWISE_PARTITION_VALUE_MIGRATE as partition key is /id

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

// --- Azure Blob Storage Client ---
async function getAzureBlobContainerClient(): Promise<BlobContainerClient> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString) {
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONNECTION_STRING is not configured.");
  }
  if (!containerName || typeof containerName !== 'string' || containerName.trim() === '') {
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string.");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  return blobServiceClient.getContainerClient(containerName);
}

// --- Azure Cosmos DB Client ---
async function getCosmosDBContainer(): Promise<CosmosContainer> {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;
  const containerId = process.env.COSMOS_DB_TRANSACTIONS_CONTAINER_ID;

  if (!endpoint || !key || !databaseId || !containerId) {
    throw new Error("Cosmos DB environment variables are not fully configured (COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE_ID, COSMOS_DB_TRANSACTIONS_CONTAINER_ID).");
  }

  const cosmosClient = new CosmosClient({ endpoint, key });
  const database = cosmosClient.database(databaseId);
  return database.container(containerId);
}

async function migrateTransactions() {
  console.log("Starting transaction migration from Azure Blob Storage to Azure Cosmos DB...");
  console.log("Data migrated to Cosmos will be partitioned by /id.");

  let blobContainerClient: BlobContainerClient;
  let cosmosContainer: CosmosContainer;

  try {
    blobContainerClient = await getAzureBlobContainerClient();
    cosmosContainer = await getCosmosDBContainer();
    console.log("Successfully connected to both Azure Blob Storage and Cosmos DB.");
  } catch (error: any) {
    console.error("Failed to initialize clients:", error.message);
    return;
  }

  let migratedCount = 0;
  let errorCount = 0;
  let blobCount = 0;

  try {
    console.log(`Listing blobs in directory: ${TRANSACTIONS_BLOB_DIR}`);
    const blobsIterator = blobContainerClient.listBlobsFlat({ prefix: TRANSACTIONS_BLOB_DIR });

    for await (const blob of blobsIterator) {
      blobCount++;
      if (!blob.name.endsWith('.json') || blob.name === TRANSACTIONS_BLOB_DIR) {
        console.log(`Skipping non-JSON or directory blob: ${blob.name}`);
        continue;
      }

      console.log(`Processing blob #${blobCount}: ${blob.name}`);
      try {
        const blobClient = blobContainerClient.getBlobClient(blob.name);
        const downloadBlockBlobResponse = await blobClient.download(0);

        if (!downloadBlockBlobResponse.readableStreamBody) {
          console.warn(`Blob ${blob.name} has no readable stream body, skipping.`);
          errorCount++;
          continue;
        }

        const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
        const transactionDataFromBlob = JSON.parse(buffer.toString()) as RawTransaction;

        if (!transactionDataFromBlob.id) {
          console.warn(`Transaction data from ${blob.name} is missing an 'id'. Skipping.`);
          errorCount++;
          continue;
        }
        
        // The transactionDataFromBlob already has an 'id' which will be used as the partition key.
        // No need to add a 'finwise' field anymore.
        const transactionDataForCosmos = { ...transactionDataFromBlob };

        await cosmosContainer.items.upsert(transactionDataForCosmos);
        console.log(`Successfully migrated transaction ${transactionDataForCosmos.id} from ${blob.name} to Cosmos DB.`);
        migratedCount++;
      } catch (itemError: any) {
        console.error(`Error processing blob ${blob.name}: ${itemError.message}`, itemError.stack);
        errorCount++;
      }
    }
  } catch (listError: any) {
    console.error(`Failed to list blobs from Azure Blob Storage: ${listError.message}`, listError.stack);
    errorCount++; 
  }

  console.log("\n--- Migration Summary ---");
  console.log(`Total blobs processed/attempted: ${blobCount}`);
  console.log(`Successfully migrated transactions: ${migratedCount}`);
  console.log(`Errors encountered: ${errorCount}`);
  if (errorCount > 0) {
    console.log("Please review the errors above.");
  }
  console.log("Migration process finished.");
}

migrateTransactions().catch(err => {
  console.error("Unhandled error during migration script execution:", err.message, err.stack);
});
