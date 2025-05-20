
'use server';

import { initialTransactions } from '@/lib/data';
import type { Transaction as AppTransaction, TransactionEnumType, ExpenseEnumType } from '@/lib/types';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// Zod schema for validating transaction input
const TransactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  date: z.date(),
  amount: z.number().positive("Amount must be a positive number."),
  description: z.string().min(1, "Description is required."),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  expenseType: z.enum(['need', 'want', 'investment_expense']).optional(),
  source: z.string().optional(),
}).refine(data => {
  if (data.type === 'expense') {
    return !!data.category && !!data.paymentMethod && !!data.expenseType;
  }
  return true;
}, {
  message: "For expenses, Category, Payment Method, and Expense Type are required.",
  path: ['type'], 
}).refine(data => {
  if (data.type === 'income') {
    return !!data.source;
  }
  return true;
}, {
  message: "For income, Source is required.",
  path: ['type'],
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;

// Helper to simulate database operations on the in-memory array
let transactionsStore: AppTransaction[] = [...initialTransactions]; // Use a mutable copy

export async function getTransactions(): Promise<AppTransaction[]> {
  try {
    // Simulate fetching data by returning a copy of the current in-memory store
    // Ensure dates are proper Date objects if they were stringified
    return JSON.parse(JSON.stringify(transactionsStore)).map((t: AppTransaction) => ({
        ...t,
        date: new Date(t.date),
        createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined,
    }));
  } catch (error) {
    console.error('Failed to get transactions from in-memory store:', error);
    throw new Error('Could not retrieve transactions.');
  }
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

  try {
    const newTransaction: AppTransaction = {
      ...validation.data,
      id: crypto.randomUUID(), // Generate a unique ID
      amount: validation.data.amount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    transactionsStore.push(newTransaction);
    
    // Re-assign to initialTransactions if you intend data.ts to reflect runtime changes (not truly static then)
    // For a truly static initial set and runtime changes only in memory, operate on transactionsStore only.
    // initialTransactions = [...transactionsStore]; // If you want to update the exported array (has side effects)

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return JSON.parse(JSON.stringify(newTransaction)); // Return a copy
  } catch (error) {
    console.error('Failed to add transaction to in-memory store:', error);
    throw new Error('Could not add transaction.');
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  // Basic validation for partial update
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount <= 0)) {
    throw new Error("Invalid amount for update.");
  }
  if (data.description !== undefined && data.description.trim() === "") {
     throw new Error("Description cannot be empty for update.");
  }

  try {
    const transactionIndex = transactionsStore.findIndex(t => t.id === id);
    if (transactionIndex === -1) {
      throw new Error('Transaction not found.');
    }

    const updatedTransaction = {
      ...transactionsStore[transactionIndex],
      ...data,
      date: data.date ? new Date(data.date) : transactionsStore[transactionIndex].date,
      amount: data.amount !== undefined ? data.amount : transactionsStore[transactionIndex].amount,
      updatedAt: new Date(),
    };
    transactionsStore[transactionIndex] = updatedTransaction;

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return JSON.parse(JSON.stringify(updatedTransaction)); // Return a copy
  } catch (error) {
    console.error('Failed to update transaction in in-memory store:', error);
    throw new Error('Could not update transaction.');
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  try {
    const initialLength = transactionsStore.length;
    transactionsStore = transactionsStore.filter(t => t.id !== id);
    if (transactionsStore.length === initialLength) {
      throw new Error('Transaction not found for deletion.');
    }
    
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete transaction from in-memory store:', error);
    throw new Error('Could not delete transaction.');
  }
}
