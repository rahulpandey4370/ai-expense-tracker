
'use server';

import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { Goal, GoalInput } from '@/lib/types';
import { GoalInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const GOALS_DIR = 'goals/';
const AI_PLAYGROUND_PATH = '/ai-playground';

let containerClient: ContainerClient;

async function getAzureContainerClient(): Promise<ContainerClient> {
  if (containerClient) {
    return containerClient;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    console.error("Azure Storage environment variables (AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_CONTAINER_NAME) are not configured for goals.");
    throw new Error("Azure Storage environment variables are not configured for goals.");
  }
  
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const client = blobServiceClient.getContainerClient(containerName);
    containerClient = client;
    return containerClient;
  } catch (error) {
    console.error("Failed to initialize Azure Blob Service Client or Container Client for goals:", error);
    throw new Error("Could not connect to Azure Blob Storage for goals. Check configuration and credentials.");
  }
}

export async function addGoal(data: GoalInput): Promise<Goal> {
  const validation = GoalInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('Add goal validation error (Azure):', readableErrors);
    throw new Error(`Invalid goal data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const newGoal: Goal = { id, ...validation.data, amountSavedSoFar: 0, createdAt: now, updatedAt: now, status: 'active' };
  
  const client = await getAzureContainerClient();
  const filePath = `${GOALS_DIR}${id}.json`;
  const blockBlobClient = client.getBlockBlobClient(filePath);

  try {
    await blockBlobClient.uploadString(JSON.stringify(newGoal, null, 2), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    revalidatePath(AI_PLAYGROUND_PATH);
    return newGoal;
  } catch (error: any) {
    console.error('Failed to add goal to Azure blob:', error);
    throw new Error(`Could not add goal to Azure blob storage. Original error: ${error.message}`);
  }
}

export async function getGoals(): Promise<Goal[]> {
  const goals: Goal[] = [];
  const client = await getAzureContainerClient();
  
  try {
    const blobsIterator = client.listBlobsFlat({ prefix: GOALS_DIR });
    for await (const blob of blobsIterator) {
      if (!blob.name.endsWith('.json')) continue;
      try {
        const blobClient = client.getBlobClient(blob.name);
        const downloadBlockBlobResponse = await blobClient.downloadToString();
        const goalData: Goal = JSON.parse(downloadBlockBlobResponse);
        goals.push(goalData);
      } catch (fetchError: any) {
        console.error(`Error processing Azure goal blob ${blob.name}:`, fetchError);
        if (fetchError instanceof RestError && fetchError.statusCode === 404) {
             console.warn(`Azure goal blob ${blob.name} not found during processing, skipping.`);
        } else { /* Potentially rethrow or handle other errors */ }
      }
    }
  } catch (error: any) {
    console.error('Failed to list goals from Azure blob:', error);
    if (error instanceof RestError && error.statusCode === 404) {
      // This typically means the prefix itself or container might not exist or is empty, which is not an error for getGoals.
      console.warn("No goals found or prefix issue, returning empty array for Azure goals.");
      return [];
    }
    throw new Error(`Could not fetch goals from Azure Blob store. Original error: ${error.message}`);
  }
  return goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateGoalProgress(goalId: string, allocatedAmount: number): Promise<Goal> {
  const client = await getAzureContainerClient();
  const filePath = `${GOALS_DIR}${goalId}.json`;
  const blobClient = client.getBlobClient(filePath);
  let existingGoal: Goal;

  if (allocatedAmount <= 0) {
    throw new Error("Allocated amount must be positive.");
  }

  try {
    const downloadResponse = await blobClient.downloadToString();
    existingGoal = JSON.parse(downloadResponse);
  } catch (error: any) {
    console.error(`Failed to fetch goal ${goalId} from Azure for update:`, error);
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
    await blockBlobClient.uploadString(JSON.stringify(updatedGoal, null, 2), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
    revalidatePath(AI_PLAYGROUND_PATH);
    return updatedGoal;
  } catch (error: any) {
    console.error('Failed to update goal in Azure blob:', error);
    throw new Error(`Could not update goal in Azure blob storage. Original error: ${error.message}`);
  }
}

export async function deleteGoal(id: string): Promise<{ success: boolean }> {
  const client = await getAzureContainerClient();
  const filePath = `${GOALS_DIR}${id}.json`;
  const blobClient = client.getBlobClient(filePath);
  try {
    await blobClient.deleteIfExists();
    revalidatePath(AI_PLAYGROUND_PATH);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete goal from Azure blob:', error);
    throw new Error(`Could not delete goal from Azure blob storage. Original error: ${error.message}`);
  }
}
