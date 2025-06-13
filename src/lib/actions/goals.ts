
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { Goal, GoalInput } from '@/lib/types';
import { GoalInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const GOALS_DIR = 'goals/';
const AI_PLAYGROUND_PATH = '/ai-playground';

let goalsContainerClientInstance: ContainerClient; 

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

async function getAzureGoalsContainerClient(): Promise<ContainerClient> {
  console.log("Azure Info (goals.ts): Attempting to get Azure Container Client for goals...");
  if (goalsContainerClientInstance) {
    console.log("Azure Info (goals.ts): Returning cached container client instance for goals.");
    return goalsContainerClientInstance;
  }
  console.log("Azure Info (goals.ts): No cached client instance for goals, creating new one.");

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  console.log(`Azure Info (goals.ts): Read AZURE_STORAGE_CONNECTION_STRING. Is present: ${!!connectionString}, Length (if present): ${connectionString?.length || 0}`);
  console.log(`Azure Info (goals.ts): Read AZURE_STORAGE_CONTAINER_NAME: '${containerName}'. Is present: ${!!containerName}, Type: ${typeof containerName}`);

  if (!connectionString) {
    console.error("Azure Critical Error (goals.ts): AZURE_STORAGE_CONNECTION_STRING is not configured or empty. This is required for goals functionality.");
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONNECTION_STRING is not configured for goals. Please check Vercel environment variables.");
  }
  if (!containerName || typeof containerName !== 'string' || containerName.trim() === '') {
    console.error(`Azure Critical Error (goals.ts): AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string. Value: '${containerName}'. This is required for goals functionality.`);
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string for goals. Please check Vercel environment variables.");
  }

  try {
    console.log(`Azure Info (goals.ts): Attempting to create BlobServiceClient from connection string... (First 30 chars of CS: ${connectionString.substring(0,30)}...)`);
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    console.log(`Azure Info (goals.ts): BlobServiceClient created successfully. Attempting to get container client for '${containerName}'...`);
    const client = blobServiceClient.getContainerClient(containerName);
    console.log(`Azure Info (goals.ts): Container client for '${containerName}' (goals) obtained successfully.`);
    goalsContainerClientInstance = client;
    return goalsContainerClientInstance;
  } catch (error: any) {
    console.error(`Azure CRITICAL Error (goals.ts): Failed to initialize BlobServiceClient or ContainerClient. CS present: ${!!connectionString}, CN: ${containerName}. Error Type: ${error.name}, Message: ${error.message}`, error.stack);
    if (error.message && error.message.toLowerCase().includes("invalid url")) {
        console.error("Azure CRITICAL Error (goals.ts): The Azure Storage Connection String appears to be malformed, leading to an 'Invalid URL' error. Please verify its format.");
    }
    throw new Error(`Could not connect to Azure Blob Storage for goals. Check configuration and credentials. Original error: ${error.message}`);
  }
}

export async function addGoal(data: GoalInput): Promise<Goal> {
  console.log("Azure Info (goals.ts): Attempting to add goal...");
  const validation = GoalInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('Azure Error (goals.ts): Add goal validation error:', readableErrors);
    throw new Error(`Invalid goal data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const newGoal: Goal = { id, ...validation.data, amountSavedSoFar: 0, createdAt: now, updatedAt: now, status: 'active' };

  const client = await getAzureGoalsContainerClient();
  const filePath = `${GOALS_DIR}${id}.json`;
  const blockBlobClient = client.getBlockBlobClient(filePath);

  try {
    console.log(`Azure Info (goals.ts): Adding goal ${id} to ${filePath}`);
    const content = JSON.stringify(newGoal, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    console.log(`Azure Info (goals.ts): Successfully added goal ${id}`);
    revalidatePath(AI_PLAYGROUND_PATH);
    return newGoal;
  } catch (error: any) {
    console.error(`Azure Error (goals.ts): Failed to add goal ${id} to Azure blob. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not add goal to Azure blob storage. Original error: ${error.message}`);
  }
}

export async function getGoals(options?: { limit?: number }): Promise<Goal[]> {
  const goals: Goal[] = [];
  const client = await getAzureGoalsContainerClient();
  console.log(`Azure Info (goals.ts): Attempting to get goals. Options: ${JSON.stringify(options)}`);
  const limit = options?.limit;
  let processedBlobCount = 0;

  try {
    console.log(`Azure Info (goals.ts): Listing blobs in directory: ${GOALS_DIR}`);
    const blobsIterator = client.listBlobsFlat({ prefix: GOALS_DIR });
    for await (const blob of blobsIterator) {
      processedBlobCount++;
      if (!blob.name || !blob.name.endsWith('.json') || blob.name === GOALS_DIR) {
        continue;
      }
      try {
        const blobClient = client.getBlobClient(blob.name);
        const downloadBlockBlobResponse = await blobClient.download(0);
        if (!downloadBlockBlobResponse.readableStreamBody) {
          console.warn(`Azure Warning (goals.ts): Goal blob ${blob.name} has no readable stream body, skipping.`);
          continue;
        }
        const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
        const goalData: Goal = JSON.parse(buffer.toString());
        goals.push(goalData);

        if (limit && goals.length >= limit) {
          console.log(`Azure Info (goals.ts): Reached processing limit of ${limit}. Breaking loop after processing ${goals.length} goals from ${processedBlobCount} listed blobs.`);
          break;
        }
      } catch (fetchError: any) {
        console.error(`Azure Error (goals.ts): Error processing goal blob ${blob.name}. Status: ${fetchError.statusCode}, Message: ${fetchError.message}`, fetchError.stack);
        if (fetchError instanceof RestError && fetchError.statusCode === 404) {
             console.warn(`Azure Warning (goals.ts): Goal blob ${blob.name} not found during processing, skipping.`);
        }
      }
    }
    console.log(`Azure Info (goals.ts): Fetched ${goals.length} goals. Total blobs listed/attempted: ${processedBlobCount}.`);
  } catch (error: any) {
    console.error('Azure Error (goals.ts): Failed to list goals from Azure blob.', error.message, error.stack);
     if (error instanceof RestError && error.statusCode === 404 && error.message.includes("ContainerNotFound")) {
        console.warn("Azure Warning (goals.ts): Container for goals not found. Returning empty array. The container might need to be created in Azure portal.");
        return [];
    }
    throw new Error(`Could not fetch goals from Azure Blob store. Original error: ${error.message}`);
  }
  return goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateGoalProgress(goalId: string, allocatedAmount: number): Promise<Goal> {
  console.log(`Azure Info (goals.ts): Attempting to update goal progress for ${goalId}...`);
  const client = await getAzureGoalsContainerClient();
  const filePath = `${GOALS_DIR}${goalId}.json`;
  const blobClient = client.getBlobClient(filePath);
  let existingGoal: Goal;

  if (allocatedAmount <= 0) {
    throw new Error("Allocated amount must be positive.");
  }

  try {
    console.log(`Azure Info (goals.ts): Fetching goal ${goalId} for update from ${filePath}`);
    const downloadResponse = await blobClient.download(0);
    if (!downloadResponse.readableStreamBody) {
      console.error(`Azure Error (goals.ts): Blob ${filePath} for goal update has no readable stream body.`);
      throw new Error(`Blob ${filePath} for goal update has no readable stream body.`);
    }
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
    existingGoal = JSON.parse(buffer.toString());
    console.log(`Azure Info (goals.ts): Successfully fetched goal ${goalId} for update.`);
  } catch (error: any) {
    console.error(`Azure Error (goals.ts): Failed to fetch goal ${goalId} from Azure for update. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    if (error instanceof RestError && error.statusCode === 404) {
      throw new Error(`Goal with ID ${goalId} not found for update in Azure.`);
    }
    throw new Error(`Could not retrieve goal for update from Azure. Original error: ${error.message}`);
  }

  const updatedAmountSaved = (existingGoal.amountSavedSoFar || 0) + allocatedAmount;
  const updatedGoal: Goal = {
    ...existingGoal,
    amountSavedSoFar: updatedAmountSaved,
    status: updatedAmountSaved >= existingGoal.targetAmount ? 'completed' : existingGoal.status,
    updatedAt: new Date().toISOString(),
  };

  const blockBlobClient = client.getBlockBlobClient(filePath);
  try {
    console.log(`Azure Info (goals.ts): Updating goal ${goalId} in ${filePath}`);
    const content = JSON.stringify(updatedGoal, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    console.log(`Azure Info (goals.ts): Successfully updated goal ${goalId}`);
    revalidatePath(AI_PLAYGROUND_PATH);
    return updatedGoal;
  } catch (error: any) {
    console.error(`Azure Error (goals.ts): Failed to update goal ${goalId} in Azure blob. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not update goal in Azure blob storage. Original error: ${error.message}`);
  }
}

export async function deleteGoal(id: string): Promise<{ success: boolean }> {
  console.log(`Azure Info (goals.ts): Attempting to delete goal ${id}...`);
  const client = await getAzureGoalsContainerClient();
  const filePath = `${GOALS_DIR}${id}.json`;
  const blobClient = client.getBlobClient(filePath);
  try {
    console.log(`Azure Info (goals.ts): Deleting goal ${id} from ${filePath}`);
    await blobClient.deleteIfExists();
    console.log(`Azure Info (goals.ts): Successfully deleted goal ${id}`);
    revalidatePath(AI_PLAYGROUND_PATH);
    return { success: true };
  } catch (error: any) {
    console.error(`Azure Error (goals.ts): Failed to delete goal ${id} from Azure blob. Status: ${error.statusCode}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not delete goal from Azure blob storage. Original error: ${error.message}`);
  }
}
