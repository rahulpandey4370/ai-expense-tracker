'use server';

import { getSupabase } from '@/lib/supabase';
import type { SplitUser, SplitUserInput, UserBalance, AppTransaction } from '@/lib/types';
import { SplitUserInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import { queryTransactions, type TransactionQueryOptions } from './transactions';

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

// --- Balances ---
export async function getSplitBalances(): Promise<UserBalance[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('open_split_balances');
  if (error) {
    console.error('Supabase Error (getSplitBalances):', error.message);
    throw new Error(`Could not compute split balances. Original error: ${error.message}`);
  }
  return (data as any[]).map(row => ({
    userId: row.user_id,
    userName: row.user_name,
    theyOweMe: row.they_owe_me,
    iOweThem: row.i_owe_them,
    net: row.net,
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

/** Marks one participant's share on a transaction I paid as settled (they
 *  paid me back). Never creates an income transaction — money coming back is
 *  a balance-sheet event, not income, so it must not inflate the income KPI. */
export async function settleSplitShare(transactionId: string, userId: string): Promise<{ success: boolean }> {
  const supabase = getSupabase();
  const { error, count } = await supabase
    .from('transaction_splits')
    .update({ is_settled: true, settled_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('transaction_id', transactionId)
    .eq('user_id', userId);
  if (error) throw new Error(`Could not settle split share. Original error: ${error.message}`);
  if (!count) throw new Error('Split share not found.');

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  revalidatePath('/');
  revalidatePath('/transactions');
  return { success: true };
}

/** Marks my own share on a transaction someone else paid as settled (I paid
 *  them back). This is the opposite direction from settleSplitShare — the
 *  debtor here is me, not a split_users row, so it lives on the transaction
 *  itself (transactions.my_share_settled) rather than in transaction_splits. */
export async function settleMyShare(transactionId: string): Promise<{ success: boolean }> {
  const supabase = getSupabase();
  const { error, count } = await supabase
    .from('transactions')
    .update({ my_share_settled: true, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', transactionId)
    .not('paid_by_id', 'is', null);
  if (error) throw new Error(`Could not settle your share. Original error: ${error.message}`);
  if (!count) throw new Error('Transaction not found or was not paid by someone else.');

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  revalidatePath('/');
  revalidatePath('/transactions');
  return { success: true };
}

/** Settles every open balance for one person: shares they owe me (as a
 *  payer's split rows) and, if that person is also recorded as the payer on
 *  transactions where I owe my own share, those too. */
export async function settleAllForUser(userId: string): Promise<{ successCount: number }> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { error: splitsError, count: splitsCount } = await supabase
    .from('transaction_splits')
    .update({ is_settled: true, settled_at: now, updated_at: now }, { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_settled', false);
  if (splitsError) throw new Error(`Could not settle balances. Original error: ${splitsError.message}`);

  const { error: myShareError, count: myShareCount } = await supabase
    .from('transactions')
    .update({ my_share_settled: true, updated_at: now }, { count: 'exact' })
    .eq('paid_by_id', userId)
    .eq('my_share_settled', false);
  if (myShareError) throw new Error(`Could not settle balances. Original error: ${myShareError.message}`);

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  revalidatePath('/');
  revalidatePath('/transactions');
  return { successCount: (splitsCount ?? 0) + (myShareCount ?? 0) };
}
