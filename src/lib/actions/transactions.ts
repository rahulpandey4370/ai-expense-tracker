
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
  message: "Missing required fields for the selected transaction type. For expenses, category, payment method, and expense type are needed. For income, source is needed.",
  path: ["type"], // General path, specific errors will be highlighted by Zod on fields
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;


function mapPrismaTransactionToApp(prismaTransaction: any): AppTransaction {
  if (!prismaTransaction) {
    console.error("mapPrismaTransactionToApp received null or undefined transaction");
    // This should ideally not be reached if queries are sound and return valid objects or empty arrays.
    // Consider how to handle this case, possibly by throwing an error or returning a default object.
    // For now, this path implies a critical issue upstream.
    throw new Error("Invalid data received from database for mapping.");
  }
  return {
    ...prismaTransaction,
    amount: prismaTransaction.amount != null ? parseFloat(prismaTransaction.amount.toString()) : 0,
    date: prismaTransaction.date ? new Date(prismaTransaction.date) : new Date(),
    category: prismaTransaction.category ?? undefined,
    paymentMethod: prismaTransaction.paymentMethod ?? undefined,
    expenseType: prismaTransaction.expenseType ?? undefined,
    source: prismaTransaction.source ?? undefined,
    createdAt: prismaTransaction.createdAt ? new Date(prismaTransaction.createdAt) : undefined,
    updatedAt: prismaTransaction.updatedAt ? new Date(prismaTransaction.updatedAt) : undefined,
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
  } catch (error: any) {
    console.error('Detailed error in getTransactions while fetching from database:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
    if (error.code) { 
        console.error('Prisma error code:', error.code);
    }
    // The generic error thrown to the client side
    throw new Error(`Database query failed: Could not fetch transactions. Please check server logs on Vercel for detailed Prisma errors. Ensure migrations ran successfully. Original error: ${error.message}`);
  }
}

export async function addTransaction(data: TransactionInput): Promise<AppTransaction> {
  const validation = TransactionInputSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors = validation.error.flatten().fieldErrors;
    console.error('Add transaction validation error:', fieldErrors);
    // Construct a more readable error message from Zod errors
    const errorMessages = Object.entries(fieldErrors)
      .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
      .join('; ');
    throw new Error(`Invalid transaction data: ${errorMessages || "Validation failed."}`);
  }

  try {
    const newTransaction = await prisma.transaction.create({
      data: {
        ...validation.data,
        // Prisma's Decimal type can accept number directly if auto-conversion is set up,
        // but ensure it's correctly handled. Prisma client expects specific types.
        amount: validation.data.amount, 
      },
    });
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return mapPrismaTransactionToApp(newTransaction);
  } catch (error: any) {
    console.error('Detailed error in addTransaction:', error);
    if (error.code) {
        console.error('Prisma error code:', error.code);
    }
    throw new Error(`Database insert failed: Could not add transaction. Check server logs for details. Original error: ${error.message}`);
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  // For partial updates, consider using a partial Zod schema or careful manual validation.
  // Ensure amount is correctly formatted if provided.
  const updateData: any = { ...data };
  if (data.amount !== undefined) {
    updateData.amount = data.amount; 
  }
  if (data.date !== undefined) {
    updateData.date = new Date(data.date);
  }

  // Validate before update if using a schema, or ensure data types match Prisma expectations.
  // Example: Minimal validation for critical fields if not using Zod partial for updates.
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount <= 0)) {
    throw new Error("Invalid amount for update.");
  }
  if (data.description !== undefined && data.description.trim() === "") {
     throw new Error("Description cannot be empty for update.");
  }


  try {
    const updatedTransaction = await prisma.transaction.update({
      where: { id },
      data: updateData,
    });
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return mapPrismaTransactionToApp(updatedTransaction);
  } catch (error: any) {
    console.error('Detailed error in updateTransaction:', error);
     if (error.code) {
        console.error('Prisma error code:', error.code);
    }
    throw new Error(`Database update failed: Could not update transaction. Check server logs for details. Original error: ${error.message}`);
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
  } catch (error: any)
   {
    console.error('Detailed error in deleteTransaction:', error);
     if (error.code) {
        console.error('Prisma error code:', error.code);
    }
    throw new Error(`Database delete failed: Could not delete transaction. Check server logs for details. Original error: ${error.message}`);
  }
}
