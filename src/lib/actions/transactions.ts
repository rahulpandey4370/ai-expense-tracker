
'use server';

import prisma from '@/lib/prisma';
import type { Transaction as AppTransaction, TransactionInput as AppTransactionInput, Category, PaymentMethod } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types'; // Zod schema
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

// Helper function to convert Prisma Decimal to number for all transactions
// Prisma Float fields are returned as Decimal, convert to number for frontend.
function convertTransactionAmounts(transaction: any): AppTransaction {
  return {
    ...transaction,
    amount: transaction.amount instanceof Prisma.Decimal ? transaction.amount.toNumber() : Number(transaction.amount),
  };
}

// --- Category Actions ---
export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  try {
    const categories = await prisma.category.findMany({
      where: type ? { type } : undefined,
      orderBy: { name: 'asc' },
    });
    return categories;
  } catch (error: any) {
    console.error('Failed to fetch categories:', error);
    throw new Error(`Database query failed: Could not fetch categories. Ensure migrations ran successfully. Original error: ${error.message}`);
  }
}

// --- PaymentMethod Actions ---
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  try {
    const paymentMethods = await prisma.paymentMethod.findMany({
      orderBy: { name: 'asc' },
    });
    return paymentMethods;
  } catch (error: any) {
    console.error('Failed to fetch payment methods:', error);
    throw new Error(`Database query failed: Could not fetch payment methods. Ensure migrations ran successfully. Original error: ${error.message}`);
  }
}

// --- Transaction Actions ---
export async function getTransactions(): Promise<AppTransaction[]> {
  try {
    const transactionsFromDb = await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      include: {
        category: true,
        paymentMethod: true,
      },
    });
    return transactionsFromDb.map(convertTransactionAmounts);
  } catch (error: any) {
    console.error('Failed to fetch transactions:', error);
    throw new Error(`Database query failed: Could not fetch transactions. Ensure migrations ran successfully. Original error: ${error.message}`);
  }
}

export async function addTransaction(data: AppTransactionInput): Promise<AppTransaction> {
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
    // Use Prisma.Decimal for amount
    const amountAsDecimal = new Prisma.Decimal(validation.data.amount);

    const newTransactionFromDb = await prisma.transaction.create({
      data: {
        type: validation.data.type,
        date: validation.data.date,
        amount: amountAsDecimal, // Store as Decimal
        description: validation.data.description,
        categoryId: validation.data.categoryId,
        paymentMethodId: validation.data.paymentMethodId,
        source: validation.data.source,
        expenseType: validation.data.expenseType,
      },
      include: {
        category: true,
        paymentMethod: true,
      }
    });
    
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return convertTransactionAmounts(newTransactionFromDb);
  } catch (error: any) {
    console.error('Failed to add transaction:', error);
    throw new Error(`Could not add transaction to the database. Original error: ${error.message}`);
  }
}

export async function updateTransaction(id: string, data: Partial<AppTransactionInput>): Promise<AppTransaction> {
   // A more robust approach might use a partial Zod schema for updates.
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount <= 0)) {
    throw new Error("Invalid amount for update.");
  }
  if (data.description !== undefined && data.description !== null && data.description.trim() === "" && data.type === "expense") { // Description is optional for income if source is provided
     throw new Error("Description cannot be empty for expense update.");
  }
  
  // Construct data for Prisma update, handling Decimal conversion for amount
  const prismaUpdateData: Prisma.TransactionUncheckedUpdateInput = { ...data };
  if (data.amount !== undefined) {
    prismaUpdateData.amount = new Prisma.Decimal(data.amount);
  }
  if (data.date !== undefined) {
    prismaUpdateData.date = new Date(data.date);
  }


  try {
    const updatedTransactionFromDb = await prisma.transaction.update({
      where: { id },
      data: prismaUpdateData,
      include: {
        category: true,
        paymentMethod: true,
      }
    });

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return convertTransactionAmounts(updatedTransactionFromDb);
  } catch (error: any) {
    console.error('Failed to update transaction:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new Error('Transaction not found for update.');
    }
    throw new Error(`Could not update transaction in the database. Original error: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to delete transaction:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new Error('Transaction not found for deletion.');
    }
    throw new Error(`Could not delete transaction from the database. Original error: ${error.message}`);
  }
}
