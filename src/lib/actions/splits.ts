'use server';

import { getSupabase } from '@/lib/supabase';
import type { SplitUser, SplitUserInput, UserBalance, AppTransaction } from '@/lib/types';
import { SplitUserInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import { queryTransactions, type TransactionQueryOptions } from './transactions';
import { getSessionUser } from '@/lib/auth/supabase-server';
import { getHome, settleWithPerson } from '@/lib/split/service';

const SPLIT_EXPENSES_PAGE_PATH = '/split-expenses';

function toSplitUser(row: any): SplitUser {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

// --- People directory ---
export async function addSplitUser(data: SplitUserInput): Promise<SplitUser> {
  const validation = SplitUserInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid split user data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const newUser: SplitUser = { id, ...validation.data, createdAt: now, updatedAt: now };

  const supabase = getSupabase();
  const { error } = await supabase.from('split_users').insert({ id, name: newUser.name, created_at: now, updated_at: now });
  if (error) throw new Error(`Could not add split user to Supabase. Original error: ${error.message}`);

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return newUser;
}

export async function getSplitUsers(): Promise<SplitUser[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('split_users').select('*').order('name', { ascending: true });
  if (error) {
    console.error('Supabase Error (getSplitUsers):', error.message);
    throw new Error(`Could not fetch split users from Supabase. Original error: ${error.message}`);
  }
  return (data as any[]).map(toSplitUser);
}

export async function deleteSplitUser(id: string): Promise<{ success: boolean }> {
  if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    throw new Error(`Invalid split user ID provided for delete. Received ID: '${id}'`);
  }

  const supabase = getSupabase();
  // transaction_splits.user_id and transactions.paid_by_id both reference
  // split_users with `on delete restrict`, so this fails loudly (rather than
  // silently orphaning historical split data) if the person has any split history.
  const { error } = await supabase.from('split_users').delete().eq('id', id);
  if (error) {
    if (error.message.toLowerCase().includes('violates foreign key constraint')) {
      throw new Error('This person has split transactions on their history and cannot be deleted. Settle up first.');
    }
    throw new Error(`Could not delete split user from Supabase. Original error: ${error.message}`);
  }

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return { success: true };
}

// --- Balances (from the group ledger; kept under the old names for the AI tools and reads) ---
/** One row per person I have an open balance with, across all my groups. userId is the person key. */
export async function getSplitBalances(): Promise<UserBalance[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const home = await getHome(user);
  return home.people.map(p => ({
    userId: p.key,
    userName: p.name,
    theyOweMe: Math.max(p.net, 0),
    iOweThem: Math.max(-p.net, 0),
    net: p.net,
  }));
}

// --- Split transactions (the Split Expenses page is a view over these) ---

/** Transactions that have any split rows at all — powers "settled history" too. */
export async function getSplitTransactions(options?: { limit?: number }): Promise<{ rows: AppTransaction[]; total: number }> {
  const opts: TransactionQueryOptions = {
    isSplit: true,
    sortKey: 'date',
    sortDir: 'desc',
    pageSize: options?.limit ?? 200,
  };
  return queryTransactions(opts);
}

/** Records that this person paid back their share of one expense (userId = person key from getSplitBalances). */
export async function settleSplitShare(transactionId: string, userId: string): Promise<{ success: boolean }> {
  const user = await getSessionUser();
  if (!user?.isOwner) throw new Error('Only the owner can settle from here.');
  const { successCount } = await settleWithPerson(user, userId, transactionId);
  if (!successCount) throw new Error('No open share for that person on this expense.');
  return { success: true };
}

/** Records payments clearing everything open with one person (userId = person key from getSplitBalances). */
export async function settleAllForUser(userId: string): Promise<{ successCount: number }> {
  const user = await getSessionUser();
  if (!user?.isOwner) throw new Error('Only the owner can settle from here.');
  return settleWithPerson(user, userId);
}
