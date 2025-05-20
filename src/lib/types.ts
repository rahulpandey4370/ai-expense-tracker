import type { Category as PrismaCategory, PaymentMethod as PrismaPaymentMethod, Transaction as PrismaTransaction } from '@prisma/client';
import { z } from 'zod';

// Re-export Prisma generated types if they are sufficient
export type Category = PrismaCategory;
export type PaymentMethod = PrismaPaymentMethod;
// export type Transaction = PrismaTransaction; // Using extended below

// Custom Transaction type if we need to transform Prisma's Decimal to number for frontend
// Prisma returns `Decimal` for `Float` fields, which needs conversion for JS `number` type.
export interface Transaction extends Omit<PrismaTransaction, 'amount'> {
  amount: number; // Ensure amount is treated as number in the app
}

// Zod schema for validating transaction input for Server Actions
// This should align with the Prisma model for Transaction
export const TransactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  date: z.date(),
  amount: z.number().positive("Amount must be a positive number."),
  description: z.string().min(1, "Description is required.").optional(),
  categoryId: z.string().optional(), // For expenses, will be required by refine
  paymentMethodId: z.string().optional(), // For expenses, will be required by refine
  source: z.string().optional(), // For income, will be required by refine
  expenseType: z.enum(['need', 'want', 'investment_expense']).optional(), // For expenses
}).refine(data => {
  if (data.type === 'expense') {
    return !!data.categoryId && !!data.paymentMethodId && !!data.expenseType;
  }
  return true;
}, {
  message: "For expenses, Category, Payment Method, and Expense Type are required.",
  path: ['type'],
}).refine(data => {
  if (data.type === 'income') {
    // For income, categoryId might be used to associate with an income category.
    // Source field stores the text description like "Salary", "Freelance".
    return !!data.source && !!data.categoryId;
  }
  return true;
}, {
  message: "For income, Source and Category are required.",
  path: ['type'],
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;

// Derived types for UI convenience, if needed
export type TransactionType = PrismaTransaction['type']; // "income" | "expense"
export type ExpenseType = Exclude<PrismaTransaction['expenseType'], null | undefined>; // "need" | "want" | "investment_expense"
