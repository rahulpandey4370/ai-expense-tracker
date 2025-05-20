
'use server';

import prisma from '@/lib/prisma';
import type { Transaction as AppTransaction, TransactionEnumType, ExpenseEnumType } from '@/lib/types';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// Zod schema for validating transaction input
const TransactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  date: z.date(),
  amount: z.number().positive(),
  description: z.string().min(1, "Description is required"),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  expenseType: z.enum(['need', 'want', 'investment_expense']).optional(),
  source: z.string().optional(),
}).refine(data => {
  if (data.type === 'expense' && (!data.category || !data.paymentMethod || !data.expenseType)) {
    return false;
  }
  if (data.type === 'income' && !data.source) {
    return false;
  }
  return true;
}, {
  message: "Missing required fields for the selected transaction type.",
  path: ["type"], // General path, specific field errors would be better if refined per type
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;


function mapPrismaTransactionToApp(prismaTransaction: any): AppTransaction {
  return {
    ...prismaTransaction,
    amount: parseFloat(prismaTransaction.amount), // Prisma returns Decimal, convert to number
    date: new Date(prismaTransaction.date), // Ensure date is a Date object
  };
}

export async function getTransactions(): Promise<AppTransaction[]> {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: {
        date: 'desc',
      },
    });
    return transactions.map(mapPrismaTransactionToApp);
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    // Consider throwing a more specific error or returning an error object
    throw new Error('Database query failed: Could not fetch transactions.');
  }
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    console.error('Add transaction validation error:', validation.error.flatten().fieldErrors);
    throw new Error(`Invalid transaction data: ${JSON.stringify(validation.error.flatten().fieldErrors)}`);
  }

  try {
    const newTransaction = await prisma.transaction.create({
      data: {
        ...validation.data,
        // Prisma expects 'amount' as a number, Zod schema ensures it
      },
    });
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return mapPrismaTransactionToApp(newTransaction);
  } catch (error) {
    console.error('Failed to add transaction:', error);
    throw new Error('Database insert failed: Could not add transaction.');
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  // For partial updates, zod's .partial() can be used if needed,
  // but here we ensure the core structure is compatible.
  // A more specific schema for updates might be beneficial.
  
  // Basic validation: ensure at least one field is being updated if we want to be strict.
  // For simplicity, Prisma will handle if data is empty.

  try {
    const updatedTransaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...data,
        date: data.date ? new Date(data.date) : undefined, // Ensure date is Date object if provided
        // Prisma handles 'amount' conversion if it's a number
      },
    });
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return mapPrismaTransactionToApp(updatedTransaction);
  } catch (error) {
    console.error('Failed to update transaction:', error);
    throw new Error('Database update failed: Could not update transaction.');
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  try {
    await prisma.transaction.delete({
      where: { id },
    });
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    throw new Error('Database delete failed: Could not delete transaction.');
  }
}

