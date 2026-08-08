'use server';

import { getSupabase } from '@/lib/supabase';
import type { AppTransaction, RawTransaction, Category, PaymentMethod, TransactionInput, TransactionSplitInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types';
import { getAppCalendarDayString } from '@/lib/date-utils';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

// --- Category and Payment Method Functions ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  const supabase = getSupabase();
  let query = supabase.from('categories').select('*');
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) {
    console.error('Supabase Error (getCategories):', error.message);
    throw new Error(`Could not fetch categories from Supabase. Original error: ${error.message}`);
  }
  return data as Category[];
}

export async function addCategory(data: Omit<Category, 'id'>): Promise<Category> {
  const allCategories = await getCategories();
  if (allCategories.some(c => c.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error(`Category "${data.name}" already exists.`);
  }

  const newCategory: Category = { id: cuid(), ...data };
  const supabase = getSupabase();
  const { error } = await supabase.from('categories').insert(newCategory);
  if (error) throw new Error(`Could not add category to Supabase. Original error: ${error.message}`);

  revalidatePath('/settings');
  revalidatePath('/transactions');
  return newCategory;
}

export async function deleteCategory(id: string): Promise<{ success: boolean }> {
  const supabase = getSupabase();
  const { error, count } = await supabase.from('categories').delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(`Could not delete category from Supabase. Original error: ${error.message}`);
  if (!count) throw new Error('Category not found.');

  revalidatePath('/settings');
  revalidatePath('/transactions');
  return { success: true };
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('payment_methods').select('*');
  if (error) {
    console.error('Supabase Error (getPaymentMethods):', error.message);
    throw new Error(`Could not fetch payment methods from Supabase. Original error: ${error.message}`);
  }
  return data as PaymentMethod[];
}

export async function addPaymentMethod(data: Omit<PaymentMethod, 'id'>): Promise<PaymentMethod> {
  const allMethods = await getPaymentMethods();
  if (allMethods.some(pm => pm.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error(`Payment method "${data.name}" already exists.`);
  }

  const newMethod: PaymentMethod = { id: cuid(), ...data };
  const supabase = getSupabase();
  const { error } = await supabase.from('payment_methods').insert(newMethod);
  if (error) throw new Error(`Could not add payment method to Supabase. Original error: ${error.message}`);

  revalidatePath('/settings');
  revalidatePath('/transactions');
  return newMethod;
}

export async function deletePaymentMethod(id: string): Promise<{ success: boolean }> {
  const supabase = getSupabase();
  const { error, count } = await supabase.from('payment_methods').delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(`Could not delete payment method from Supabase. Original error: ${error.message}`);
  if (!count) throw new Error('Payment method not found.');

  revalidatePath('/settings');
  revalidatePath('/transactions');
  return { success: true };
}

// --- Transaction Functions ---
function toRawTransaction(row: any): RawTransaction {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    amount: row.amount,
    description: row.description,
    categoryId: row.category_id ?? undefined,
    paymentMethodId: row.payment_method_id ?? undefined,
    source: row.source ?? undefined,
    expenseType: row.expense_type ?? undefined,
    isSplit: row.is_split ?? undefined,
    myShare: row.my_share ?? undefined,
    paidById: row.paid_by_id ?? undefined,
    splitMethod: row.split_method ?? undefined,
    myShareSettled: row.my_share_settled ?? undefined,
    netAmount: row.net_amount ?? row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTransactionRow(tx: RawTransaction): Record<string, any> {
  return {
    id: tx.id,
    type: tx.type,
    date: tx.date.slice(0, 10),
    amount: tx.amount,
    description: tx.description,
    category_id: tx.categoryId ?? null,
    payment_method_id: tx.paymentMethodId ?? null,
    source: tx.source ?? null,
    expense_type: tx.expenseType ?? null,
    is_split: tx.isSplit ?? null,
    my_share: tx.myShare ?? null,
    paid_by_id: tx.paidById ?? null,
    split_method: tx.splitMethod ?? null,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
  };
}

// --- Efficient server-side querying (reads the transactions_expanded view) ---
// The view (supabase/functions.sql) flattens category/payment-method names and
// aggregates transaction_splits onto each row so filtering, sorting (incl. by
// those names), and pagination all run in Postgres in one query — no full
// lookup-table fetch, no N+1 for splits.
function hydrateExpandedRow(row: any): AppTransaction {
  const rawTx = toRawTransaction(row);
  return {
    ...rawTx,
    date: new Date(rawTx.date),
    createdAt: new Date(rawTx.createdAt),
    updatedAt: new Date(rawTx.updatedAt),
    category: row.category_id
      ? { id: row.category_id, name: row.category_name, type: row.category_type }
      : undefined,
    paymentMethod: row.payment_method_id
      ? { id: row.payment_method_id, name: row.payment_method_name, type: row.payment_method_type }
      : undefined,
    paidBy: row.paid_by_id
      ? { id: row.paid_by_id, name: row.paid_by_name, createdAt: '', updatedAt: '' }
      : undefined,
    splits: Array.isArray(row.splits) ? row.splits : [],
  } as AppTransaction;
}

export async function getTransactions(options?: { limit?: number }): Promise<AppTransaction[]> {
  const supabase = getSupabase();
  let query = supabase.from('transactions_expanded').select('*').order('date', { ascending: false });
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    console.error('Supabase Error (getTransactions):', error.message);
    throw new Error(`Could not fetch transactions from Supabase. Original error: ${error.message}`);
  }

  return (data as any[]).map(hydrateExpandedRow);
}

/**
 * Fetch fully-hydrated transactions within an inclusive [startYmd, endYmd] date
 * window (YYYY-MM-DD). Pushes the date filter into Postgres so callers only
 * transfer the rows they actually need instead of the entire table.
 *
 * Pages through the results so ranges with more than Supabase's default 1000-row
 * cap are returned in full (otherwise older rows in a wide window silently drop).
 */
export async function getTransactionsInRange(startYmd: string, endYmd: string): Promise<AppTransaction[]> {
  const supabase = getSupabase();
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('transactions_expanded')
      .select('*')
      .gte('date', startYmd)
      .lte('date', endYmd)
      .order('date', { ascending: false })
      .order('id', { ascending: true }) // stable order across pages
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Supabase Error (getTransactionsInRange):', error.message);
      throw new Error(`Could not fetch transactions in range. Original error: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows.map(hydrateExpandedRow);
}

export interface TransactionQueryOptions {
  startDate?: string;          // YYYY-MM-DD inclusive
  endDate?: string;            // YYYY-MM-DD inclusive
  type?: 'income' | 'expense';
  expenseType?: string;
  expenseTypes?: string[];
  categoryId?: string;
  categoryNames?: string[];
  paymentMethodId?: string;
  isSplit?: boolean;
  search?: string;
  sortKey?: 'date' | 'amount' | 'description' | 'type' | 'categoryName' | 'paymentMethodName';
  sortDir?: 'asc' | 'desc';
  page?: number;               // 1-based
  pageSize?: number;
}

/**
 * Server-side filtered, sorted, and paginated transaction query. Every filter,
 * the sort, and pagination run in Postgres — the browser only ever receives one
 * page of rows plus the total count. This is what the transactions list uses.
 */
export async function queryTransactions(
  opts: TransactionQueryOptions = {}
): Promise<{ rows: AppTransaction[]; total: number }> {
  const supabase = getSupabase();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase.from('transactions_expanded').select('*', { count: 'exact' });

  if (opts.startDate) q = q.gte('date', opts.startDate);
  if (opts.endDate) q = q.lte('date', opts.endDate);
  if (opts.type) q = q.eq('type', opts.type);
  if (opts.expenseType) q = q.eq('expense_type', opts.expenseType);
  if (opts.expenseTypes && opts.expenseTypes.length) q = q.in('expense_type', opts.expenseTypes);
  if (opts.paymentMethodId) q = q.eq('payment_method_id', opts.paymentMethodId);
  if (typeof opts.isSplit === 'boolean') q = q.eq('is_split', opts.isSplit);

  // Category filter: by id directly, or resolve names -> ids (categories table is tiny).
  let categoryIds: string[] | undefined;
  if (opts.categoryId) {
    categoryIds = [opts.categoryId];
  } else if (opts.categoryNames && opts.categoryNames.length) {
    const cats = await getCategories();
    const wanted = new Set(opts.categoryNames.map(n => n.toLowerCase()));
    categoryIds = cats.filter(c => wanted.has(c.name.toLowerCase())).map(c => c.id);
    if (categoryIds.length === 0) return { rows: [], total: 0 };
  }
  if (categoryIds) {
    q = categoryIds.length === 1 ? q.eq('category_id', categoryIds[0]) : q.in('category_id', categoryIds);
  }

  if (opts.search) {
    // Strip PostgREST logic-tree delimiters so free text can't break the filter.
    const term = `%${opts.search.replace(/[,()]/g, ' ')}%`;
    q = q.or(`description.ilike.${term},source.ilike.${term}`);
  }

  const asc = (opts.sortDir ?? 'desc') === 'asc';
  switch (opts.sortKey) {
    case 'amount': q = q.order('amount', { ascending: asc }); break;
    case 'description': q = q.order('description', { ascending: asc }); break;
    case 'type': q = q.order('type', { ascending: asc }); break;
    case 'categoryName': q = q.order('category_name', { ascending: asc, nullsFirst: false }); break;
    case 'paymentMethodName': q = q.order('payment_method_name', { ascending: asc, nullsFirst: false }); break;
    case 'date':
    default: q = q.order('date', { ascending: asc });
  }
  q = q.order('id', { ascending: true }); // stable tiebreaker for pagination
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) {
    console.error('Supabase Error (queryTransactions):', error.message);
    throw new Error(`Could not query transactions. Original error: ${error.message}`);
  }
  return { rows: (data as any[]).map(hydrateExpandedRow), total: count ?? 0 };
}

/**
 * Writes a transaction and its split rows (if any) atomically via the
 * create_transaction_with_splits() Postgres function — a mid-write failure
 * must never leave an amount whose shares don't sum to it.
 */
async function writeTransactionWithSplits(
  row: Record<string, any>,
  splits: { userId: string; shareAmount: number }[]
): Promise<any> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_transaction_with_splits', {
    p_transaction: row,
    p_splits: splits.map(s => ({ userId: s.userId, shareAmount: s.shareAmount })),
  });
  if (error) throw new Error(`Could not save transaction. Original error: ${error.message}`);
  return (data as any[])[0];
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid transaction data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();

  const newItem: RawTransaction = {
    id,
    ...validation.data,
    // Store the calendar day in the app timezone (not a UTC slice), so a picked
    // "July 1" isn't rolled back to June 30 for IST users.
    date: getAppCalendarDayString(validation.data.date)!,
    description: validation.data.description || '',
    createdAt: now,
    updatedAt: now,
  };

  const createdRow = await writeTransactionWithSplits(toTransactionRow(newItem), validation.data.splits ?? []);

  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/reports');
  revalidatePath('/yearly-overview');
  revalidatePath('/ai-playground');
  revalidatePath('/split-expenses');

  return hydrateExpandedRow(createdRow);
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    throw new Error(`Invalid or missing transaction ID provided for update. Received ID: '${id}'`);
  }

  const supabase = getSupabase();
  const { data: existingRows, error: readError } = await supabase.from('transactions').select('*').eq('id', id).limit(1);
  if (readError) throw new Error(`Could not retrieve transaction for update. Original error: ${readError.message}`);
  if (!existingRows || existingRows.length === 0) {
    throw new Error(`Transaction with ID ${id} not found for update.`);
  }
  const existingItem = toRawTransaction(existingRows[0]);

  // `splits` is the sentinel for "this call fully specifies the split state".
  // The transaction form always sends it (populated, or `[]` to clear a
  // split) on every save. Callers that never touch splitting at all —
  // recurring materialization, programmatic edits — omit it entirely, so
  // their update preserves whatever split already exists instead of wiping it.
  const touchesSplit = data.splits !== undefined;
  let existingSplits: TransactionSplitInput[] = [];
  if (!touchesSplit) {
    const { data: splitRows, error: splitsError } = await supabase
      .from('transaction_splits')
      .select('user_id, share_amount')
      .eq('transaction_id', id);
    if (splitsError) throw new Error(`Could not read existing splits. Original error: ${splitsError.message}`);
    existingSplits = (splitRows ?? []).map(r => ({ userId: r.user_id, shareAmount: r.share_amount }));
  }

  const updatedRawData = {
    ...existingItem,
    ...data,
    date: data.date ? data.date.toISOString() : existingItem.date,
    description: data.description !== undefined ? data.description : existingItem.description,
    myShare: touchesSplit ? data.myShare : existingItem.myShare,
    paidById: touchesSplit ? data.paidById : existingItem.paidById,
    splitMethod: touchesSplit ? data.splitMethod : existingItem.splitMethod,
    updatedAt: new Date().toISOString(),
  };

  const transactionInputForValidation: TransactionInput = {
    type: updatedRawData.type,
    date: new Date(updatedRawData.date),
    amount: updatedRawData.amount,
    description: updatedRawData.description,
    categoryId: updatedRawData.categoryId,
    paymentMethodId: updatedRawData.paymentMethodId,
    source: updatedRawData.source,
    expenseType: updatedRawData.expenseType,
    myShare: updatedRawData.myShare,
    paidById: updatedRawData.paidById,
    splitMethod: updatedRawData.splitMethod,
    splits: data.splits !== undefined ? data.splits : existingSplits,
  };

  const validation = TransactionInputSchema.safeParse(transactionInputForValidation);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid transaction data for update: ${readableErrors || "Validation failed."}`);
  }

  const finalItemToUpdate: RawTransaction = {
    id: existingItem.id,
    type: validation.data.type,
    // App-timezone calendar day (see addTransaction) — avoids the UTC roll-back.
    date: getAppCalendarDayString(validation.data.date)!,
    amount: validation.data.amount,
    description: validation.data.description || '',
    categoryId: validation.data.categoryId,
    paymentMethodId: validation.data.paymentMethodId,
    source: validation.data.source,
    expenseType: validation.data.expenseType,
    myShare: validation.data.myShare,
    paidById: validation.data.paidById,
    splitMethod: validation.data.splitMethod,
    createdAt: existingItem.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const updatedRow = await writeTransactionWithSplits(toTransactionRow(finalItemToUpdate), validation.data.splits ?? []);

  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/reports');
  revalidatePath('/yearly-overview');
  revalidatePath('/ai-playground');
  revalidatePath('/split-expenses');

  return hydrateExpandedRow(updatedRow);
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    throw new Error(`Invalid or missing transaction ID provided for delete. Received ID: '${id}'`);
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw new Error(`Could not delete transaction from Supabase. Original error: ${error.message}`);

  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/reports');
  revalidatePath('/yearly-overview');
  revalidatePath('/ai-playground');
  return { success: true };
}

export async function deleteMultipleTransactions(ids: string[]): Promise<{ successCount: number, errorCount: number, errors: {id: string, error: string}[] }> {
  if (!ids || ids.length === 0) {
    return { successCount: 0, errorCount: 0, errors: [] };
  }

  const validIds = ids.filter(id => id && typeof id === 'string' && id.trim() !== '' && id !== 'undefined' && id !== 'null');
  const invalidIds = ids.filter(id => !validIds.includes(id));

  const supabase = getSupabase();
  const errors: { id: string, error: string }[] = invalidIds.map(id => ({ id: String(id), error: `Invalid ID provided in bulk delete: '${id}'` }));

  let successCount = 0;
  if (validIds.length > 0) {
    const { error, count } = await supabase.from('transactions').delete({ count: 'exact' }).in('id', validIds);
    if (error) {
      validIds.forEach(id => errors.push({ id, error: error.message }));
    } else {
      successCount = count ?? validIds.length;
    }
  }

  if (successCount > 0) {
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    revalidatePath('/ai-playground');
  }

  return { successCount, errorCount: errors.length, errors };
}
