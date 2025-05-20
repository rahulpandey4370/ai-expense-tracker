
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
  path: ["type"],
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;


function mapPrismaTransactionToApp(prismaTransaction: any): AppTransaction {
  // Ensure prismaTransaction and its properties are not null/undefined before accessing
  if (!prismaTransaction) {
    // This case should ideally not happen if findMany returns valid objects or an empty array
    console.error("mapPrismaTransactionToApp received null or undefined transaction");
    // Depending on how you want to handle this, you might throw an error or return a default/empty object
    // For now, let's assume valid objects are passed or an empty array, which wouldn't call this for its elements.
    // If it's possible findMany returns [null], filter them out before mapping or handle here.
  }
  return {
    ...prismaTransaction,
    // Prisma returns Decimal for 'amount', ensure it's converted to number.
    // Check if amount is a string that needs parsing, or already a number/Decimal object.
    // Prisma's Decimal type might need .toNumber() or similar if it's not automatically handled.
    // For safety, explicitly handle potential null/undefined from DB if schema allows.
    amount: prismaTransaction.amount != null ? parseFloat(prismaTransaction.amount.toString()) : 0,
    date: prismaTransaction.date ? new Date(prismaTransaction.date) : new Date(), // Ensure date is a Date object
    // Ensure optional fields are handled gracefully if they might be null from DB
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
    if (error.code) { // Prisma errors often have a code
        console.error('Prisma error code:', error.code);
    }
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    // The generic error thrown to the client side
    throw new Error('Database query failed: Could not fetch transactions. Please check server logs on Vercel for more details.');
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
        amount: validation.data.amount, // Prisma expects Decimal, but number should work if Prisma handles conversion
      },
    });
    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/reports');
    return mapPrismaTransactionToApp(newTransaction);
  } catch (error: any) {
    console.error('Detailed error in addTransaction:', error);
    throw new Error('Database insert failed: Could not add transaction. Check server logs for details.');
  }
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>): Promise<AppTransaction> {
  // Basic validation or use a partial Zod schema for updates if needed.
  // For Prisma, ensure amount is correctly formatted if provided.
  const updateData: any = { ...data };
  if (data.amount !== undefined) {
    updateData.amount = data.amount; // Assuming amount is already a number
  }
  if (data.date !== undefined) {
    updateData.date = new Date(data.date);
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
    throw new Error('Database update failed: Could not update transaction. Check server logs for details.');
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
    console.error('Detailed error in deleteTransaction:', error);
    throw new Error('Database delete failed: Could not delete transaction. Check server logs for details.');
  }
}
