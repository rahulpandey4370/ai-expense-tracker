'use server';

import prisma from '@/lib/prisma';
import type { Transaction as AppTransaction, TransactionInput as AppTransactionInput } from '@/lib/types';
import { TransactionInputSchema } from '@/lib/types'; // Zod schema
import type { Category, PaymentMethod } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client'; // Import Prisma for Decimal type

// Helper function to convert Prisma Decimal to number for all transactions
function convertDecimalToNumber(transaction: any): AppTransaction {
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
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    throw new Error('Database query failed: Could not fetch categories.');
  }
}

// --- PaymentMethod Actions ---
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  try {
    const paymentMethods = await prisma.paymentMethod.findMany({
      orderBy: { name: 'asc' },
    });
    return paymentMethods;
  } catch (error) {
    console.error('Failed to fetch payment methods:', error);
    throw new Error('Database query failed: Could not fetch payment methods.');
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
    return transactionsFromDb.map(convertDecimalToNumber);
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    throw new Error('Database query failed: Could not fetch transactions. Please check server logs on Vercel for detailed Prisma errors. Ensure migrations ran successfully.');
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
    const newTransactionFromDb = await prisma.transaction.create({
      data: {
        type: validation.data.type,
        date: validation.data.date,
        amount: new Prisma.Decimal(validation.data.amount),
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
    return convertDecimalToNumber(newTransactionFromDb);
  } catch (error) {
    console.error('Failed to add transaction:', error);
    throw new Error('Could not add transaction to the database.');
  }
}

export async function updateTransaction(id: string, data: Partial<AppTransactionInput>): Promise<AppTransaction> {
   // For partial updates, we still validate the parts that are present.
   // A more robust approach might use a partial Zod schema for updates.
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount <= 0)) {
    throw new Error("Invalid amount for update.");
  }
  if (data.description !== undefined && data.description !== null && data.description.trim() === "") {
     throw new Error("Description cannot be empty for update.");
  }
  
  // Construct data for Prisma update, handling Decimal conversion for amount
  const prismaUpdateData: Prisma.TransactionUpdateInput = { ...data };
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
    return convertDecimalToNumber(updatedTransactionFromDb);
  } catch (error) {
    console.error('Failed to update transaction:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new Error('Transaction not found for update.');
    }
    throw new Error('Could not update transaction in the database.');
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new Error('Transaction not found for deletion.');
    }
    throw new Error('Could not delete transaction from the database.');
  }
}
