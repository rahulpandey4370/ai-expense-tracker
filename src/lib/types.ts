
import { z } from 'zod';

// Base types for data stored in Blob / used by app
export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: string; // e.g., 'Credit Card', 'UPI', 'Cash'
}

// This is the raw transaction structure as it might be stored in a blob
// It uses IDs for category and paymentMethod
export interface RawTransaction {
  id: string;
  type: 'income' | 'expense';
  date: string; // ISO string
  amount: number;
  description: string;
  categoryId?: string;
  paymentMethodId?: string;
  source?: string;
  expenseType?: 'need' | 'want' | 'investment_expense';
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// This is the "hydrated" transaction type used by the frontend,
// where category and paymentMethod are populated objects.
export interface AppTransaction extends Omit<RawTransaction, 'categoryId' | 'paymentMethodId' | 'date' | 'createdAt' | 'updatedAt'> {
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  category?: Category;
  paymentMethod?: PaymentMethod;
}

// Zod schema for validating transaction input for Server Actions
// This is for single transaction entry and for the final validated data from bulk/AI
export const TransactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  date: z.date(),
  amount: z.number().gt(0, "Amount must be a positive number."),
  description: z.string().min(1, "Description is required."),
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  source: z.string().optional(),
  expenseType: z.enum(['need', 'want', 'investment_expense']).optional(),
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
    return !!data.categoryId;
  }
  return true;
}, {
  message: "For income, a Category (e.g., Salary) is required.",
  path: ['type'],
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;

// Derived types for UI convenience, if needed
export type TransactionType = 'income' | 'expense';
export type ExpenseType = 'need' | 'want' | 'investment_expense';


// Zod schema for a single transaction parsed by AI from text
export const ParsedAITransactionSchema = z.object({
  date: z.string().describe("The transaction date in YYYY-MM-DD format. Infer based on text and current date if relative (e.g., 'yesterday')."),
  description: z.string().describe("A concise description of the transaction."),
  amount: z.number().min(0.01, "Amount must be positive.").describe("The transaction amount as a positive number."),
  type: z.enum(['income', 'expense']).describe("The type of transaction."),
  categoryNameGuess: z.string().optional().describe("The best guess for the category name from the provided list. If an exact match is not found, use the closest one or 'Others' if applicable. If no category seems to fit, leave blank."),
  paymentMethodNameGuess: z.string().optional().describe("If it's an expense, the best guess for the payment method name from the provided list. If no payment method seems to fit or it's an income, leave blank."),
  expenseTypeNameGuess: z.enum(['need', 'want', 'investment_expense']).optional().describe("If it's an expense, guess its type: 'need', 'want', or 'investment_expense'. If not clearly identifiable or income, leave blank."),
  sourceGuess: z.string().optional().describe("If it's an income, a brief description of the source (e.g., 'Salary from X', 'Freelance Project Y'). If not clearly identifiable or expense, leave blank."),
  confidenceScore: z.number().min(0).max(1).optional().describe("AI's confidence in parsing this specific transaction (0.0 to 1.0). 1.0 means very confident."),
  error: z.string().optional().describe("If this specific part of the text couldn't be parsed as a valid transaction, provide a brief error message here."),
});
export type ParsedAITransaction = z.infer<typeof ParsedAITransactionSchema>;


// Zod schema for the structure of a single transaction parsed by AI from a receipt image
export const ParsedReceiptTransactionSchema = z.object({
  date: z.string().optional().describe("The transaction date from the receipt in YYYY-MM-DD format. If unidentifiable, leave blank."),
  description: z.string().optional().describe("The merchant name or a concise description of the transaction from the receipt. If unidentifiable, leave blank."),
  amount: z.number().min(0.01, "Amount must be positive.").optional().describe("The total transaction amount as a positive number. If unidentifiable, leave blank."),
  categoryNameGuess: z.string().optional().describe("The best guess for the category name from the provided list based on items or merchant. If unsure, use 'Others' or leave blank."),
  paymentMethodNameGuess: z.string().optional().describe("The best guess for the payment method name from the provided list (e.g., 'Credit Card', 'Cash') if discernible. If unsure, leave blank."),
  expenseTypeNameGuess: z.enum(['need', 'want', 'investment_expense']).optional().describe("Guess its type: 'need', 'want', or 'investment_expense'. If not clearly identifiable, leave blank."),
  confidenceScore: z.number().min(0).max(1).optional().describe("AI's confidence in parsing this receipt (0.0 to 1.0)."),
  error: z.string().optional().describe("If the receipt couldn't be parsed reliably or is unreadable, provide a brief error message here."),
});
export type ParsedReceiptTransaction = z.infer<typeof ParsedReceiptTransactionSchema>;

