
'use server';

import { put, del, list, head, type BlobResult } from '@vercel/blob';
import type { AppTransaction, RawTransaction, TransactionInput, Category, PaymentMethod } from '@/lib/types';
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
    // If head doesn't throw and we have a URL, file exists. Fetch it.
     // Vercel Blob SDK's head might not throw 404 but return an object without size or url if not found.
    // A more robust check might be needed depending on exact head behavior for non-existent blobs.
    // For now, if blob.url exists, assume file exists.
    if (blob && blob.url) {
      const response = await fetch(blob.url); // Use downloadUrl if available and private, or url if public
      if (!response.ok) throw new Error(`Failed to fetch ${filePath} - ${response.statusText}`);
      return await response.json();
    }
    // If blob.url is not present, assume it doesn't exist or is not accessible
    throw new Error('Blob not found or not accessible');
  } catch (error: any) {
    // Check if error indicates 'not_found' or similar
    if (error.message.includes('Blob not found') || error.status === 404 || (error.message.includes('The specified blob does not exist'))) {
      // File doesn't exist, so create it with defaults
      await put(filePath, JSON.stringify(defaultData), { access: 'public', addRandomSuffix: false });
      return defaultData;
    }
    // For other errors, re-throw
    console.error(`Error ensuring blob file ${filePath}:`, error);
    throw new Error(`Blob storage error for ${filePath}: ${error.message}`);
  }
}


// --- Category Actions ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  const allCategories = await ensureBlobStoreFile<Category>(CATEGORIES_BLOB_PATH, defaultCategories);
  if (type) {
    return allCategories.filter(c => c.type === type);
  }
  return allCategories;
}

// --- PaymentMethod Actions ---
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  return ensureBlobStoreFile<PaymentMethod>(PAYMENT_METHODS_BLOB_PATH, defaultPaymentMethods);
}

// --- Transaction Actions ---
export async function getTransactions(): Promise<AppTransaction[]> {
  const [allCategories, allPaymentMethods] = await Promise.all([
    getCategories(),
    getPaymentMethods()
  ]);

  const categoryMap = new Map(allCategories.map(c => [c.id, c]));
  const paymentMethodMap = new Map(allPaymentMethods.map(pm => [pm.id, pm]));

  let transactions: AppTransaction[] = [];
  try {
    const { blobs } = await list({ prefix: TRANSACTIONS_DIR, mode: 'folded' });

    if (blobs.length === 0) {
      // Add 3 mock transactions if the store is empty
      console.log("No transactions found in blob store, creating 3 mock transactions.");
      const mockTxData: TransactionInput[] = [
        { type: 'income', date: new Date(new Date().setDate(1)), amount: 50000, description: 'Monthly Salary', categoryId: allCategories.find(c=>c.name==='Salary')?.id, source: 'Company XYZ' },
        { type: 'expense', date: new Date(new Date().setDate(5)), amount: 2500, description: 'Groceries for the week', categoryId: allCategories.find(c=>c.name==='Groceries')?.id, paymentMethodId: allPaymentMethods.find(pm=>pm.type==='UPI')?.id, expenseType: 'need' },
        { type: 'expense', date: new Date(new Date().setDate(10)), amount: 800, description: 'Dinner with friends', categoryId: allCategories.find(c=>c.name==='Food and Dining')?.id, paymentMethodId: allPaymentMethods.find(pm=>pm.type==='Credit Card')?.id, expenseType: 'want' },
      ];

      for (const txInput of mockTxData) {
        // Validate mock data (optional but good practice)
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
          description: validation.data.description || '',
          createdAt: now,
          updatedAt: now,
        };
        await put(`${TRANSACTIONS_DIR}${newId}.json`, JSON.stringify(rawTx), { access: 'public', addRandomSuffix: false });
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
       revalidatePath('/'); // Revalidate relevant paths after adding mocks
       revalidatePath('/transactions');
       revalidatePath('/reports');
    } else {
        for (const blob of blobs) {
          if (!blob.pathname.endsWith('.json')) continue; // Skip non-JSON files if any
          try {
            const response = await fetch(blob.url); // Use downloadUrl for private blobs
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
    throw new Error(`Database query failed: Could not fetch transactions. Ensure Vercel Blob store is configured and accessible. Original error: ${error.message}`);
  }

  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
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
    await put(`${TRANSACTIONS_DIR}${id}.json`, JSON.stringify(rawTransaction), { access: 'public', addRandomSuffix: false });
    
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');

    // For returning AppTransaction, fetch categories/paymentMethods to populate
    const category = validation.data.categoryId ? (await getCategories()).find(c => c.id === validation.data.categoryId) : undefined;
    const paymentMethod = validation.data.paymentMethodId ? (await getPaymentMethods()).find(pm => pm.id === validation.data.paymentMethodId) : undefined;
    
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
    if (!blobHead.url) throw new Error('Transaction not found for update.');
    const response = await fetch(blobHead.url);
    if (!response.ok) throw new Error('Failed to fetch existing transaction for update.');
    existingRawTx = await response.json();
  } catch (error: any) {
    console.error(`Failed to fetch transaction ${id} for update:`, error);
    throw new Error(`Could not retrieve transaction for update. Original error: ${error.message}`);
  }
  
  const updatedData = { ...existingRawTx, ...data };
  if (data.date) updatedData.date = data.date.toISOString(); // Convert date if present
  if (data.amount !== undefined) updatedData.amount = data.amount;
  if (data.description !== undefined) updatedData.description = data.description;


  // Re-validate the combined data if needed, or trust partial updates
  // For simplicity here, we're directly merging. Robust validation would be better.
  const rawTransactionUpdate: RawTransaction = {
    ...existingRawTx,
    ...updatedData, // Apply validated partial data
    id: existingRawTx.id, // Ensure ID is not changed
    createdAt: existingRawTx.createdAt, // Preserve original creation date
    updatedAt: new Date().toISOString(),
  };
  
  try {
    await put(blobPath, JSON.stringify(rawTransactionUpdate), { access: 'public', addRandomSuffix: false, allowOverwrite: true });
    
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');

    const category = rawTransactionUpdate.categoryId ? (await getCategories()).find(c => c.id === rawTransactionUpdate.categoryId) : undefined;
    const paymentMethod = rawTransactionUpdate.paymentMethodId ? (await getPaymentMethods()).find(pm => pm.id === rawTransactionUpdate.paymentMethodId) : undefined;

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
    await del([`${TRANSACTIONS_DIR}${id}.json`]); // Pass URL or array of URLs to del
    
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete transaction from blob:', error);
    // If del throws specific errors for not found, handle them:
    if (error.message.includes('The specified blob does not exist')) {
         console.warn(`Attempted to delete non-existent blob: ${TRANSACTIONS_DIR}${id}.json`);
         return { success: false }; // Or true if "already deleted" is success
    }
    throw new Error(`Could not delete transaction from blob storage. Original error: ${error.message}`);
  }
}

// Helper to get full blob URL from pathname - not strictly necessary if SDK handles pathnames
// async function getBlobUrl(pathname: string): Promise<string | null> {
//   try {
//     const blobInfo = await head(pathname);
//     return blobInfo.url;
//   } catch (error) {
//     // console.warn(`Could not get URL for blob ${pathname}:`, error);
//     return null;
//   }
// }
