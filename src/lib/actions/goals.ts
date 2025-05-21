
'use server';

import { put, del, list, head, type BlobNotFoundError } from '@vercel/blob';
import type { Goal, GoalInput } from '@/lib/types';
import { GoalInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import { formatISO } from 'date-fns';

const GOALS_DIR = 'goals/';
const AI_PLAYGROUND_PATH = '/ai-playground';

export async function addGoal(data: GoalInput): Promise<Goal> {
  const validation = GoalInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages)
      .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
      .join('; ');
    console.error('Add goal validation error:', readableErrors);
    throw new Error(`Invalid goal data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const newGoal: Goal = {
    id,
    ...validation.data,
    amountSavedSoFar: 0,
    createdAt: now,
    updatedAt: now,
    status: 'active',
  };

  try {
    await put(`${GOALS_DIR}${id}.json`, JSON.stringify(newGoal, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
    revalidatePath(AI_PLAYGROUND_PATH);
    return newGoal;
  } catch (error: any) {
    console.error('Failed to add goal to blob:', error);
    throw new Error(`Could not add goal to blob storage. Original error: ${error.message}`);
  }
}

export async function getGoals(): Promise<Goal[]> {
  const goals: Goal[] = [];
  try {
    const { blobs } = await list({ prefix: GOALS_DIR, mode: 'folded' });
    for (const blob of blobs) {
      if (!blob.pathname.endsWith('.json')) continue;
      try {
        const response = await fetch(blob.url, { cache: 'no-store' });
        if (!response.ok) {
          console.warn(`Failed to fetch goal blob ${blob.pathname}: ${response.statusText}`);
          continue;
        }
        const goalData: Goal = await response.json();
        goals.push(goalData);
      } catch (fetchError) {
        console.error(`Error processing goal blob ${blob.pathname}:`, fetchError);
      }
    }
  } catch (error: any) {
    console.error('Failed to list goals from blob:', error);
    // Don't throw if listing fails but no goals exist, just return empty array
    if (!(error instanceof BlobNotFoundError || (error.code === 'BLOB_NOT_FOUND'))) {
        throw new Error(`Could not fetch goals from Blob store. Original error: ${error.message}`);
    }
  }
  return goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateGoalProgress(goalId: string, allocatedAmount: number): Promise<Goal> {
  const blobPath = `${GOALS_DIR}${goalId}.json`;
  let existingGoal: Goal;

  if (allocatedAmount <= 0) {
    throw new Error("Allocated amount must be positive.");
  }

  try {
    const blobHead = await head(blobPath);
    if (!blobHead || !blobHead.url) throw new Error('Goal blob metadata not found.');
    const response = await fetch(blobHead.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch existing goal for update. Status: ${response.status}`);
    existingGoal = await response.json();
  } catch (error: any) {
    console.error(`Failed to fetch goal ${goalId} for update:`, error);
    if (error instanceof BlobNotFoundError || error.code === 'BLOB_NOT_FOUND') {
      throw new Error(`Goal with ID ${goalId} not found for update.`);
    }
    throw new Error(`Could not retrieve goal for update. Original error: ${error.message}`);
  }

  const updatedAmountSaved = (existingGoal.amountSavedSoFar || 0) + allocatedAmount;
  const updatedGoal: Goal = {
    ...existingGoal,
    amountSavedSoFar: updatedAmountSaved,
    status: updatedAmountSaved >= existingGoal.targetAmount ? 'completed' : existingGoal.status,
    updatedAt: new Date().toISOString(),
  };

  try {
    await put(blobPath, JSON.stringify(updatedGoal, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    revalidatePath(AI_PLAYGROUND_PATH);
    return updatedGoal;
  } catch (error: any) {
    console.error('Failed to update goal in blob:', error);
    throw new Error(`Could not update goal in blob storage. Original error: ${error.message}`);
  }
}

export async function deleteGoal(id: string): Promise<{ success: boolean }> {
  try {
    await del(`${GOALS_DIR}${id}.json`);
    revalidatePath(AI_PLAYGROUND_PATH);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete goal from blob:', error);
     if (error instanceof Error && (error.name === 'BlobNotFoundError' || (error as any).code === 'BLOB_NOT_FOUND') ) {
         console.warn(`Attempted to delete non-existent goal blob: ${GOALS_DIR}${id}.json`);
         return { success: true }; 
    }
    throw new Error(`Could not delete goal from blob storage. Original error: ${error.message}`);
  }
}
