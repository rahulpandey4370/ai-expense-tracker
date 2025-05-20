
import { z } from 'zod';

export type TransactionEnumType = "income" | "expense";
export type ExpenseEnumType = "need" | "want" | "investment_expense";

export interface Transaction {
  id: string;
  type: TransactionEnumType;
  date: Date;
  amount: number;
  description: string;
  category?: string; 
  paymentMethod?: string; 
  expenseType?: ExpenseEnumType;
  source?: string; 
  createdAt?: Date; // Optional, Prisma adds these
  updatedAt?: Date; // Optional, Prisma adds these
}

// Zod schema for validating transaction input for Server Actions
// This is a more specific input type, ensuring data conforms before hitting the DB.
export const TransactionDTOSchema = z.object({
  type: z.enum(['income', 'expense']),
  date: z.date(),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description cannot be empty"),
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
  message: "Category, Payment Method, and Expense Type are required for expenses.",
  path: ['category'], // Or a more general path
}).refine(data => {
  if (data.type === 'income') {
    return !!data.source;
  }
  return true;
}, {
  message: "Source is required for income.",
  path: ['source'],
});

export type TransactionInput = z.infer<typeof TransactionDTOSchema>;


export interface Category {
  id: string;
  name: string;
  type: "expense" | "income";
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: "Credit Card" | "UPI" | "Cash" | "Others"; // Kept as is for now
}

// These are not yet persisted in DB, kept for reference or future use
export interface Investment {
  id: string;
  date: Date;
  totalValue: number;
  description?: string;
}

export interface Cashback {
  id: string;
  date: Date;
  amount: number;
  source: string;
  description?: string;
}
