
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { Goal, GoalInput } from '@/lib/types';
import { GoalInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const GOALS_DIR = 'goals/';
const AI_PLAYGROUND_PATH = '/ai-playground';

let azureGoalsContainerClientInstance: ContainerClient;

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
  if (azureGoalsContainerClientInstance) {
    return azureGoalsContainerClientInstance;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString) {
    console.error("Azure Critical Error: AZURE_STORAGE_CONNECTION_STRING is not configured for goals.");
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONNECTION_STRING is not configured for goals.");
  }
  if (!containerName || typeof containerName !== 'string' || containerName.trim() === '') {
    console.error("Azure Critical Error: AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string for goals.");
    throw new Error("Azure Storage environment variable AZURE_STORAGE_CONTAINER_NAME is not configured, is empty, or is not a string for goals. Please check Vercel environment variables.");
  }

  try {
    console.log(`Azure Info: Attempting to create BlobServiceClient for goals. Connection string present: ${!!connectionString}`);
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    console.log(`Azure Info: Attempting to get container client for goals. Container name: '${containerName}'`);
    const client = blobServiceClient.getContainerClient(containerName);
    console.log(`Azure Info: Successfully created container client for '${containerName}' (goals).`);
    azureGoalsContainerClientInstance = client;
    return azureGoalsContainerClientInstance;
  } catch (error: any) {
    console.error(`Azure Critical Error: Failed to initialize BlobServiceClient or ContainerClient for goals. CS present: ${!!connectionString}, CN: ${containerName}. Error: ${error.message}`, error);
    throw new Error(`Could not connect to Azure Blob Storage for goals. Check configuration and credentials. Original error: ${error.message}`);
  }
}

export async function addGoal(data: GoalInput): Promise<Goal> {
  const validation = GoalInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('Azure Error: Add goal validation error:', readableErrors);
    throw new Error(`Invalid goal data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const newGoal: Goal = { id, ...validation.data, amountSavedSoFar: 0, createdAt: now, updatedAt: now, status: 'active' };

  const client = await getAzureGoalsContainerClient();
  const filePath = `${GOALS_DIR}${id}.json`;
  const blockBlobClient = client.getBlockBlobClient(filePath);

  try {
    console.log(`Azure Info: Adding goal ${id} to ${filePath}`);
    const content = JSON.stringify(newGoal, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    console.log(`Azure Info: Successfully added goal ${id}`);
    revalidatePath(AI_PLAYGROUND_PATH);
    return newGoal;
  } catch (error: any) {
    console.error(`Azure Error: Failed to add goal ${id} to Azure blob. Message: ${error.message}`, error);
    throw new Error(`Could not add goal to Azure blob storage. Original error: ${error.message}`);
  }
}

export async function getGoals(): Promise<Goal[]> {
  const goals: Goal[] = [];
  const client = await getAzureGoalsContainerClient();

  try {
    console.log(`Azure Info: Listing blobs in directory: ${GOALS_DIR}`);
    const blobsIterator = client.listBlobsFlat({ prefix: GOALS_DIR });
    for await (const blob of blobsIterator) {
      if (!blob.name || !blob.name.endsWith('.json') || blob.name === GOALS_DIR) {
        console.log(`Azure Debug: Skipping goal blob (name: ${blob.name}, endsWithJson: ${blob.name?.endsWith('.json')}, isDir: ${blob.name === GOALS_DIR})`);
        continue;
      }
      try {
        console.log(`Azure Info: Processing goal blob ${blob.name}`);
        const blobClient = client.getBlobClient(blob.name);
        const downloadBlockBlobResponse = await blobClient.download(0);
        if (!downloadBlockBlobResponse.readableStreamBody) {
          console.warn(`Azure Warning: Goal blob ${blob.name} has no readable stream body, skipping.`);
          continue;
        }
        const buffer = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
        const goalData: Goal = JSON.parse(buffer.toString());
        goals.push(goalData);
      } catch (fetchError: any) {
        console.error(`Azure Error: Error processing goal blob ${blob.name}. Status: ${fetchError.statusCode}, Message: ${fetchError.message}`, fetchError);
        if (fetchError instanceof RestError && fetchError.statusCode === 404) {
             console.warn(`Azure Warning: Goal blob ${blob.name} not found during processing, skipping.`);
        }
      }
    }
    console.log(`Azure Info: Fetched ${goals.length} goals.`);
  } catch (error: any) {
    console.error('Azure Error: Failed to list goals from Azure blob.', error);
     if (error instanceof RestError && error.statusCode === 404 && error.message.includes("ContainerNotFound")) {
        console.warn("Azure Warning: Container for goals not found. Returning empty array. The container might need to be created in Azure portal.");
        return [];
    }
    throw new Error(`Could not fetch goals from Azure Blob store. Original error: ${error.message}`);
  }
  return goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateGoalProgress(goalId: string, allocatedAmount: number): Promise<Goal> {
  const client = await getAzureGoalsContainerClient();
  const filePath = `${GOALS_DIR}${goalId}.json`;
  const blobClient = client.getBlobClient(filePath);
  let existingGoal: Goal;

  if (allocatedAmount <= 0) {
    throw new Error("Allocated amount must be positive.");
  }

  try {
    console.log(`Azure Info: Fetching goal ${goalId} for update from ${filePath}`);
    const downloadResponse = await blobClient.download(0);
    if (!downloadResponse.readableStreamBody) {
      console.error(`Azure Error: Blob ${filePath} for goal update has no readable stream body.`);
      throw new Error(`Blob ${filePath} for goal update has no readable stream body.`);
    }
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
    existingGoal = JSON.parse(buffer.toString());
    console.log(`Azure Info: Successfully fetched goal ${goalId} for update.`);
  } catch (error: any) {
    console.error(`Azure Error: Failed to fetch goal ${goalId} from Azure for update. Message: ${error.message}`, error);
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
    console.log(`Azure Info: Updating goal ${goalId} in ${filePath}`);
    const content = JSON.stringify(updatedGoal, null, 2);
    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    console.log(`Azure Info: Successfully updated goal ${goalId}`);
    revalidatePath(AI_PLAYGROUND_PATH);
    return updatedGoal;
  } catch (error: any) {
    console.error(`Azure Error: Failed to update goal ${goalId} in Azure blob. Message: ${error.message}`, error);
    throw new Error(`Could not update goal in Azure blob storage. Original error: ${error.message}`);
  }
}

export async function deleteGoal(id: string): Promise<{ success: boolean }> {
  const client = await getAzureGoalsContainerClient();
  const filePath = `${GOALS_DIR}${id}.json`;
  const blobClient = client.getBlobClient(filePath);
  try {
    console.log(`Azure Info: Deleting goal ${id} from ${filePath}`);
    await blobClient.deleteIfExists();
    console.log(`Azure Info: Successfully deleted goal ${id}`);
    revalidatePath(AI_PLAYGROUND_PATH);
    return { success: true };
  } catch (error: any) {
    console.error(`Azure Error: Failed to delete goal ${id} from Azure blob. Message: ${error.message}`, error);
    throw new Error(`Could not delete goal from Azure blob storage. Original error: ${error.message}`);
  }
}
