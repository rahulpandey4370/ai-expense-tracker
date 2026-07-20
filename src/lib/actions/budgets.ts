'use server';

import { getSupabase } from '@/lib/supabase';
import type { Budget, BudgetInput } from '@/lib/types';
import { BudgetInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

function toBudget(row: any): Budget {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    type: row.type,
    targetId: row.target_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getBudgets(): Promise<Budget[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('budgets').select('*');
  if (error) {
    console.error('Supabase Error (getBudgets):', error.message);
    return [];
  }
  return (data as any[]).map(toBudget);
}

export async function addBudget(data: BudgetInput): Promise<Budget> {
  const validation = BudgetInputSchema.safeParse(data);
  if (!validation.success) {
    const readableErrors = Object.entries(validation.error.flatten().fieldErrors).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid budget data: ${readableErrors}`);
  }

  const now = new Date().toISOString();
  const newBudget: Budget = { id: cuid(), ...validation.data, createdAt: now, updatedAt: now };

  const supabase = getSupabase();
  const { error } = await supabase.from('budgets').insert({
    id: newBudget.id,
    name: newBudget.name,
    amount: newBudget.amount,
    type: newBudget.type,
    target_id: newBudget.targetId,
    created_at: newBudget.createdAt,
    updated_at: newBudget.updatedAt,
  });
  if (error) throw new Error(`Could not add budget to Supabase. Original error: ${error.message}`);

  revalidatePath('/settings');
  revalidatePath('/');
  return newBudget;
}

export async function updateBudget(id: string, data: Partial<Pick<Budget, 'amount' | 'name'>>): Promise<Budget> {
  if (!id) throw new Error("Budget ID is required for update.");
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount <= 0)) {
    throw new Error("Budget amount must be a positive number.");
  }

  const supabase = getSupabase();
  const { data: updatedRows, error } = await supabase
    .from('budgets')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) throw new Error(`Could not update budget in Supabase. Original error: ${error.message}`);
  if (!updatedRows || updatedRows.length === 0) throw new Error("Budget not found.");

  revalidatePath('/settings');
  revalidatePath('/');
  return toBudget(updatedRows[0]);
}

export async function deleteBudget(id: string): Promise<{ success: boolean }> {
  const supabase = getSupabase();
  const { error, count } = await supabase.from('budgets').delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(`Could not delete budget from Supabase. Original error: ${error.message}`);
  if (!count) throw new Error("Budget not found.");

  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true };
}
