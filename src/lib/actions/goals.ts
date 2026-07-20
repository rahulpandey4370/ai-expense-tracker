'use server';

import { getSupabase } from '@/lib/supabase';
import type { Goal, GoalInput, FundAllocation } from '@/lib/types';
import { GoalInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const AI_PLAYGROUND_PATH = '/ai-playground';

function toAllocation(row: any): FundAllocation {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGoal(row: any, allocations: FundAllocation[]): Goal {
  const amountSavedSoFar = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
  return {
    id: row.id,
    description: row.description,
    targetAmount: row.target_amount,
    targetDurationMonths: row.target_duration_months,
    amountSavedSoFar,
    allocations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
  };
}

async function fetchGoalWithAllocations(goalId: string): Promise<{ goalRow: any; allocations: FundAllocation[] }> {
  const supabase = getSupabase();
  const [{ data: goalRow, error: goalError }, { data: allocRows, error: allocError }] = await Promise.all([
    supabase.from('goals').select('*').eq('id', goalId).single(),
    supabase.from('goal_allocations').select('*').eq('goal_id', goalId),
  ]);
  if (goalError || !goalRow) throw new Error(`Goal with ID ${goalId} not found.`);
  if (allocError) throw new Error(`Could not load allocations for goal. Original error: ${allocError.message}`);
  return { goalRow, allocations: (allocRows as any[]).map(toAllocation) };
}

async function recalculateAndSaveGoal(goalId: string, allocations: FundAllocation[]): Promise<Goal> {
  const supabase = getSupabase();
  const newTotalSaved = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);

  const { data: goalRow, error: readError } = await supabase.from('goals').select('*').eq('id', goalId).single();
  if (readError || !goalRow) throw new Error(`Goal with ID ${goalId} not found.`);

  const newStatus = newTotalSaved >= goalRow.target_amount ? 'completed' : (goalRow.status === 'completed' ? 'active' : goalRow.status);

  const { data: updatedRow, error: updateError } = await supabase
    .from('goals')
    .update({ amount_saved_so_far: newTotalSaved, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .select()
    .single();
  if (updateError) throw new Error(`Could not update goal. Original error: ${updateError.message}`);

  return toGoal(updatedRow, allocations);
}

export async function addGoal(data: GoalInput): Promise<Goal> {
  const validation = GoalInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid goal data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();

  const supabase = getSupabase();
  const { error } = await supabase.from('goals').insert({
    id,
    description: validation.data.description,
    target_amount: validation.data.targetAmount,
    target_duration_months: validation.data.targetDurationMonths,
    amount_saved_so_far: 0,
    status: 'active',
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`Could not add goal to Supabase. Original error: ${error.message}`);

  revalidatePath(AI_PLAYGROUND_PATH);
  return {
    id,
    ...validation.data,
    amountSavedSoFar: 0,
    allocations: [],
    createdAt: now,
    updatedAt: now,
    status: 'active',
  };
}

export async function getGoals(options?: { limit?: number }): Promise<Goal[]> {
  const supabase = getSupabase();
  let query = supabase.from('goals').select('*').order('created_at', { ascending: false });
  if (options?.limit) query = query.limit(options.limit);

  const { data: goalRows, error: goalError } = await query;
  if (goalError) {
    console.error('Supabase Error (getGoals):', goalError.message);
    throw new Error(`Could not fetch goals from Supabase. Original error: ${goalError.message}`);
  }
  if (!goalRows || goalRows.length === 0) return [];

  const goalIds = goalRows.map(g => g.id);
  const { data: allocRows, error: allocError } = await supabase.from('goal_allocations').select('*').in('goal_id', goalIds);
  if (allocError) throw new Error(`Could not fetch goal allocations from Supabase. Original error: ${allocError.message}`);

  const allocationsByGoal = new Map<string, FundAllocation[]>();
  for (const row of allocRows as any[]) {
    const list = allocationsByGoal.get(row.goal_id) || [];
    list.push(toAllocation(row));
    allocationsByGoal.set(row.goal_id, list);
  }

  return goalRows.map(row => toGoal(row, allocationsByGoal.get(row.id) || []));
}

export async function addAllocationToGoal(goalId: string, allocationName: string, allocationAmount: number): Promise<Goal> {
  if (allocationAmount <= 0) throw new Error("Allocation amount must be positive.");
  if (!allocationName.trim()) throw new Error("Allocation name is required.");

  const { allocations } = await fetchGoalWithAllocations(goalId);
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const existing = allocations.find(alloc => alloc.name.toLowerCase() === allocationName.trim().toLowerCase());
  let updatedAllocations: FundAllocation[];

  if (existing) {
    const { error } = await supabase
      .from('goal_allocations')
      .update({ amount: existing.amount + allocationAmount, updated_at: now })
      .eq('id', existing.id);
    if (error) throw new Error(`Could not update allocation. Original error: ${error.message}`);
    updatedAllocations = allocations.map(a => a.id === existing.id ? { ...a, amount: a.amount + allocationAmount, updatedAt: now } : a);
  } else {
    const newAllocation: FundAllocation = { id: cuid(), name: allocationName.trim(), amount: allocationAmount, createdAt: now, updatedAt: now };
    const { error } = await supabase.from('goal_allocations').insert({
      id: newAllocation.id,
      goal_id: goalId,
      name: newAllocation.name,
      amount: newAllocation.amount,
      created_at: newAllocation.createdAt,
      updated_at: newAllocation.updatedAt,
    });
    if (error) throw new Error(`Could not add allocation. Original error: ${error.message}`);
    updatedAllocations = [...allocations, newAllocation];
  }

  const updatedGoal = await recalculateAndSaveGoal(goalId, updatedAllocations);
  revalidatePath(AI_PLAYGROUND_PATH);
  return updatedGoal;
}

export async function editAllocation(goalId: string, allocationId: string, newAmount: number): Promise<Goal> {
  if (newAmount <= 0) throw new Error("Allocation amount must be positive.");

  const { allocations } = await fetchGoalWithAllocations(goalId);
  const allocationIndex = allocations.findIndex(alloc => alloc.id === allocationId);
  if (allocationIndex === -1) throw new Error("Allocation not found within the goal.");

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase.from('goal_allocations').update({ amount: newAmount, updated_at: now }).eq('id', allocationId);
  if (error) throw new Error(`Could not edit allocation. Original error: ${error.message}`);

  const updatedAllocations = [...allocations];
  updatedAllocations[allocationIndex] = { ...updatedAllocations[allocationIndex], amount: newAmount, updatedAt: now };

  const updatedGoal = await recalculateAndSaveGoal(goalId, updatedAllocations);
  revalidatePath(AI_PLAYGROUND_PATH);
  return updatedGoal;
}

export async function deleteAllocationFromGoal(goalId: string, allocationId: string): Promise<Goal> {
  const { allocations } = await fetchGoalWithAllocations(goalId);
  const updatedAllocations = allocations.filter(alloc => alloc.id !== allocationId);
  if (allocations.length === updatedAllocations.length) throw new Error("Allocation not found within the goal.");

  const supabase = getSupabase();
  const { error } = await supabase.from('goal_allocations').delete().eq('id', allocationId);
  if (error) throw new Error(`Could not delete allocation from goal. Original error: ${error.message}`);

  const updatedGoal = await recalculateAndSaveGoal(goalId, updatedAllocations);
  revalidatePath(AI_PLAYGROUND_PATH);
  return updatedGoal;
}

export async function deleteGoal(id: string): Promise<{ success: boolean }> {
  const supabase = getSupabase();
  // goal_allocations rows cascade-delete via the goal_id FK (see supabase/schema.sql).
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw new Error(`Could not delete goal from Supabase. Original error: ${error.message}`);

  revalidatePath(AI_PLAYGROUND_PATH);
  return { success: true };
}
