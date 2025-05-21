
'use server';

import { put, del, list, head, type BlobNotFoundError } from '@vercel/blob';
import type { AppTransaction, RawTransaction, Category, PaymentMethod, TransactionInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types';
import { defaultCategories, defaultPaymentMethods } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const CATEGORIES_BLOB_PATH = 'internal/data/categories.json';
const PAYMENT_METHODS_BLOB_PATH = 'internal/data/payment-methods.json';
const TRANSACTIONS_DIR = 'transactions/';

async function ensureBlobStoreFile<T>(filePath: string, defaultData: T[]): Promise<T[]> {
  try {
    const blob = await head(filePath);
    const response = await fetch(blob.url, { cache: 'no-store' }); // Added cache: 'no-store'
    if (!response.ok) {
      console.error(`Failed to fetch content of existing blob ${filePath}: ${response.statusText} (Status: ${response.status})`);
      // Fall through to creation logic if fetch fails for a reason other than pure non-existence (e.g. permissions changed)
      // This might lead to overwriting if not careful, but for this app's data files, it's likely a "not found" equivalent.
    } else {
      return await response.json();
    }
    // If response was not ok, it means the blob might exist but is not accessible, or some other error.
    // The original catch block handles BlobNotFoundError specifically for creation.
    // For robustness, we might consider if other non-ok statuses should also trigger creation,
    // but typically `head` would fail with BlobNotFoundError if it's truly not there.
    // If we reach here because response.ok was false, it's an edge case. The original catch will handle true "not found".
    // To be safe, we'll assume if fetch wasn't ok after head was, something is wrong, try to create.
    // This path is less likely; BlobNotFoundError in head is the primary "not found" path.
    console.warn(`Blob ${filePath} metadata found, but content fetch failed. Will attempt to create/overwrite.`);
    throw new BlobNotFoundError(); // Simulate not found to trigger creation logic

  } catch (error: any) {
    let isNotFoundError = false;
    if (error instanceof BlobNotFoundError || (error && error.name === 'BlobNotFoundError')) {
      isNotFoundError = true;
    } else if (error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      if (
        message.includes('the requested blob does not exist') ||
        message.includes('blobnotfounderror') ||
        message.includes('blob not found') ||
        message.includes('no such blob')
      ) {
        isNotFoundError = true;
      }
    }
    if (!isNotFoundError && error && error.status === 404) {
      isNotFoundError = true;
    }
    if (!isNotFoundError && error && error.code === 'BLOB_NOT_FOUND') {
        isNotFoundError = true;
    }

    if (isNotFoundError) {
      console.log(`Blob ${filePath} not found or fetch failed. Attempting to create with default data.`);
      try {
        await put(filePath, JSON.stringify(defaultData, null, 2), {
          access: 'public',
          addRandomSuffix: false,
          contentType: 'application/json',
        });
        console.log(`Successfully created blob ${filePath} with default data.`);
        return defaultData;
      } catch (putError: any) {
        console.error(`Failed to create blob ${filePath} with default data:`, putError);
        throw new Error(`Failed to initialize blob ${filePath}: ${putError.message || 'Unknown error during put operation'}`);
      }
    }
    
    console.error(`Error ensuring blob file ${filePath}:`, error);
    throw new Error(`Blob storage error for ${filePath}: ${error.message}. Please check Vercel Blob store and logs.`);
  }
}


// --- Category Actions ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  try {
    const allCategories = await ensureBlobStoreFile<Category>(CATEGORIES_BLOB_PATH, defaultCategories);
    if (type) {
      return allCategories.filter(c => c.type === type);
    }
    return allCategories;
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    throw new Error('Database query failed: Could not fetch categories. Ensure Vercel Blob is set up and migrations (if applicable) ran. Check server logs for detailed Prisma errors.');
  }
}

// --- PaymentMethod Actions ---
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
   try {
    return await ensureBlobStoreFile<PaymentMethod>(PAYMENT_METHODS_BLOB_PATH, defaultPaymentMethods);
  } catch (error) {
    console.error('Failed to fetch payment methods:', error);
    throw new Error('Database query failed: Could not fetch payment methods. Ensure Vercel Blob is set up and migrations (if applicable) ran. Check server logs for detailed Prisma errors.');
  }
}

// --- Transaction Actions ---
export async function getTransactions(): Promise<AppTransaction[]> {
  let allCategories: Category[] = [];
  let allPaymentMethods: PaymentMethod[] = [];

  try {
    [allCategories, allPaymentMethods] = await Promise.all([
      getCategories(),
      getPaymentMethods()
    ]);
  } catch (error) {
    console.error("Failed to load categories/payment methods for getTransactions, cannot proceed:", error);
    throw new Error("Essential data (categories/payment methods) could not be loaded for transactions. Check previous logs for Blob store errors.");
  }

  const categoryMap = new Map(allCategories.map(c => [c.id, c]));
  const paymentMethodMap = new Map(allPaymentMethods.map(pm => [pm.id, pm]));

  let transactions: AppTransaction[] = [];
  try {
    const { blobs } = await list({ prefix: TRANSACTIONS_DIR, mode: 'folded' });

    if (blobs.length === 0 && allCategories.length > 0 && allPaymentMethods.length > 0) {
      console.log("No transactions found in blob store, creating 3 mock transactions.");
      const salaryCategory = allCategories.find(c => c.name === 'Salary');
      const groceriesCategory = allCategories.find(c => c.name === 'Groceries');
      const foodDiningCategory = allCategories.find(c => c.name === 'Food and Dining');
      const upiPaymentMethod = allPaymentMethods.find(pm => pm.type === 'UPI'); // Assuming type 'UPI' for a generic UPI
      const ccPaymentMethod = allPaymentMethods.find(pm => pm.name === 'CC HDFC 7950'); // Using a specific CC name

      const mockTxData: TransactionInput[] = [];

      if (salaryCategory) {
        mockTxData.push({ type: 'income', date: new Date(new Date().setDate(1)), amount: 75000, description: 'Monthly Salary', categoryId: salaryCategory.id, source: 'Company A' });
      }
      if (groceriesCategory && upiPaymentMethod) {
        mockTxData.push({ type: 'expense', date: new Date(new Date().setDate(5)), amount: 3500, description: 'Weekly Groceries', categoryId: groceriesCategory.id, paymentMethodId: upiPaymentMethod.id, expenseType: 'need' });
      }
      if (foodDiningCategory && ccPaymentMethod) {
         mockTxData.push({ type: 'expense', date: new Date(new Date().setDate(10)), amount: 1200, description: 'Dinner with Friends', categoryId: foodDiningCategory.id, paymentMethodId: ccPaymentMethod.id, expenseType: 'want' });
      }
      
      if (mockTxData.length === 0 && (salaryCategory || groceriesCategory || foodDiningCategory)) {
         console.warn("Could not construct mock transactions due to missing specific default categories/payment methods for mocks.");
      }

      for (const txInput of mockTxData) {
        const validation = TransactionInputSchema.safeParse(txInput);
        if (!validation.success) {
            console.warn("Mock transaction data invalid, skipping:", validation.error.flatten().fieldErrors);
            continue;
        }
        const newId = cuid();
        const now = new Date().toISOString();
        const rawTx: RawTransaction = {
          id: newId,
          ...validation.data,
          date: validation.data.date.toISOString(),
          description: validation.data.description || '', // Ensure description is not undefined
          createdAt: now,
          updatedAt: now,
        };
        await put(`${TRANSACTIONS_DIR}${newId}.json`, JSON.stringify(rawTx, null, 2), { access: 'public', addRandomSuffix: false, contentType: 'application/json' });
        const hydratedTx: AppTransaction = {
          ...rawTx,
          date: new Date(rawTx.date),
          createdAt: new Date(rawTx.createdAt),
          updatedAt: new Date(rawTx.updatedAt),
          category: rawTx.categoryId ? categoryMap.get(rawTx.categoryId) : undefined,
          paymentMethod: rawTx.paymentMethodId ? paymentMethodMap.get(rawTx.paymentMethodId) : undefined,
        };
        transactions.push(hydratedTx);
      }
       revalidatePath('/');
       revalidatePath('/transactions');
       revalidatePath('/reports');
       revalidatePath('/yearly-overview');
    } else {
        for (const blob of blobs) {
          if (!blob.pathname.endsWith('.json')) continue;
          try {
            const response = await fetch(blob.url, { cache: 'no-store' }); // Added cache: 'no-store'
            if (!response.ok) {
                console.warn(`Failed to fetch transaction blob ${blob.pathname}: ${response.statusText}`);
                continue;
            }
            const rawTx: RawTransaction = await response.json();
            transactions.push({
              ...rawTx,
              date: new Date(rawTx.date),
              createdAt: new Date(rawTx.createdAt),
              updatedAt: new Date(rawTx.updatedAt),
              category: rawTx.categoryId ? categoryMap.get(rawTx.categoryId) : undefined,
              paymentMethod: rawTx.paymentMethodId ? paymentMethodMap.get(rawTx.paymentMethodId) : undefined,
            });
          } catch (fetchError) {
            console.error(`Error processing transaction blob ${blob.pathname}:`, fetchError);
          }
        }
    }
  } catch (error: any) {
    console.error('Failed to list or process transactions from blob:', error);
    throw new Error(`Could not fetch transactions from Blob store. Ensure Vercel Blob store is configured and accessible. Original error: ${error.message}`);
  }

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages)
      .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
      .join('; ');
    console.error('Add transaction validation error:', readableErrors);
    throw new Error(`Invalid transaction data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const rawTransaction: RawTransaction = {
    id,
    ...validation.data,
    date: validation.data.date.toISOString(),
    description: validation.data.description || '', // Ensure description is not undefined
    createdAt: now,
    updatedAt: now,
  };

  try {
    await put(`${TRANSACTIONS_DIR}${id}.json`, JSON.stringify(rawTransaction, null, 2), { access: 'public', addRandomSuffix: false, contentType: 'application/json' });

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');

    const [allCategories, allPaymentMethods] = await Promise.all([
        getCategories(),
        getPaymentMethods()
      ]);
    const category = validation.data.categoryId ? allCategories.find(c => c.id === validation.data.categoryId) : undefined;
    const paymentMethod = validation.data.paymentMethodId ? allPaymentMethods.find(pm => pm.id === validation.data.paymentMethodId) : undefined;

    return {
        ...rawTransaction,
        date: new Date(rawTransaction.date),
        createdAt: new Date(rawTransaction.createdAt),
        updatedAt: new Date(rawTransaction.updatedAt),
        category,
        paymentMethod
    };
  } catch (error: any) {
    console.error('Failed to add transaction to blob:', error);
    throw new Error(`Could not add transaction to blob storage. Original error: ${error.message}`);
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  const blobPath = `${TRANSACTIONS_DIR}${id}.json`;
  let existingRawTx: RawTransaction;

  try {
    const blobHead = await head(blobPath);
     if (!blobHead || !blobHead.url) throw new Error('Transaction blob metadata not found or URL missing for update.');
    const response = await fetch(blobHead.url, { cache: 'no-store' }); // Added cache: 'no-store'
    if (!response.ok) throw new Error(`Failed to fetch existing transaction for update. Status: ${response.status}`);
    existingRawTx = await response.json();
  } catch (error: any) {
    console.error(`Failed to fetch transaction ${id} for update:`, error);
     if (error instanceof Error && (error.name === 'BlobNotFoundError' || (error as any).code === 'BLOB_NOT_FOUND')) {
        throw new Error(`Transaction with ID ${id} not found for update.`);
    }
    throw new Error(`Could not retrieve transaction for update. Original error: ${error.message}`);
  }

  // Create a new object for updatedFields based on `data`
  const updatedFields: Partial<RawTransaction> = {};
  if (data.type !== undefined) updatedFields.type = data.type;
  if (data.date !== undefined) updatedFields.date = data.date.toISOString(); // data.date is a Date object
  if (data.amount !== undefined) updatedFields.amount = data.amount;
  
  // Handle description carefully: if data.description is explicitly passed (even as empty string), use it. Otherwise, keep existing.
  updatedFields.description = data.description !== undefined ? data.description : existingRawTx.description;


  if (data.type === 'expense' || (data.type === undefined && existingRawTx.type === 'expense')) {
    updatedFields.categoryId = data.categoryId !== undefined ? data.categoryId : existingRawTx.categoryId;
    updatedFields.paymentMethodId = data.paymentMethodId !== undefined ? data.paymentMethodId : existingRawTx.paymentMethodId;
    updatedFields.expenseType = data.expenseType !== undefined ? data.expenseType : existingRawTx.expenseType;
    // Ensure source is cleared if it was an income before and now is an expense
    if (data.type === 'expense') updatedFields.source = undefined;
  } else if (data.type === 'income' || (data.type === undefined && existingRawTx.type === 'income')) {
    updatedFields.categoryId = data.categoryId !== undefined ? data.categoryId : existingRawTx.categoryId;
    updatedFields.source = data.source !== undefined ? data.source : existingRawTx.source;
    // Ensure expense-specific fields are cleared if it was an expense before and now is an income
    if (data.type === 'income') {
      updatedFields.paymentMethodId = undefined;
      updatedFields.expenseType = undefined;
    }
  }


  const rawTransactionUpdate: RawTransaction = {
    ...existingRawTx,
    ...updatedFields,
    id: existingRawTx.id, // Ensure ID is not changed
    createdAt: existingRawTx.createdAt, // Ensure createdAt is not changed
    updatedAt: new Date().toISOString(),
  };

  try {
    await put(blobPath, JSON.stringify(rawTransactionUpdate, null, 2), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');

    const [allCategories, allPaymentMethods] = await Promise.all([
        getCategories(),
        getPaymentMethods()
      ]);
    const category = rawTransactionUpdate.categoryId ? allCategories.find(c => c.id === rawTransactionUpdate.categoryId) : undefined;
    const paymentMethod = rawTransactionUpdate.paymentMethodId ? allPaymentMethods.find(pm => pm.id === rawTransactionUpdate.paymentMethodId) : undefined;

    return {
        ...rawTransactionUpdate,
        date: new Date(rawTransactionUpdate.date),
        createdAt: new Date(rawTransactionUpdate.createdAt),
        updatedAt: new Date(rawTransactionUpdate.updatedAt),
        category,
        paymentMethod
    };
  } catch (error: any) {
    console.error('Failed to update transaction in blob:', error);
    throw new Error(`Could not update transaction in blob storage. Original error: ${error.message}`);
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  try {
    await del(`${TRANSACTIONS_DIR}${id}.json`);

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    revalidatePath('/yearly-overview');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete transaction from blob:', error);
    if (error instanceof Error && (error.name === 'BlobNotFoundError' || (error as any).code === 'BLOB_NOT_FOUND') ) {
         console.warn(`Attempted to delete non-existent blob: ${TRANSACTIONS_DIR}${id}.json`);
         // Considered success if blob already doesn't exist to avoid user-facing errors for this case
         return { success: true }; 
    }
    throw new Error(`Could not delete transaction from blob storage. Original error: ${error.message}`);
  }
}
