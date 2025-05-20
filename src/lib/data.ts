import type { Category, PaymentMethod } from './types';
import cuid from 'cuid';

// Default Categories based on the Google Sheet image
export const defaultExpenseCategories: Category[] = [
  { id: cuid(), name: 'Food and Dining', type: 'expense' },
  { id: cuid(), name: 'Groceries', type: 'expense' },
  { id: cuid(), name: 'Rent', type: 'expense' },
  { id: cuid(), name: 'Auto & Transportation', type: 'expense' },
  { id: cuid(), name: 'Loan Repayment', type: 'expense' },
  { id: cuid(), name: 'Stocks', type: 'expense' },
  { id: cuid(), name: 'Mutual Funds', type: 'expense' },
  { id: cuid(), name: 'Utilities', type: 'expense' },
  { id: cuid(), name: 'Education', type: 'expense' },
  { id: cuid(), name: 'Subscriptions', type: 'expense' },
  { id: cuid(), name: 'Home Expense', type: 'expense' },
  { id: cuid(), name: 'Maid', type: 'expense' },
  { id: cuid(), name: 'Fitness', type: 'expense' },
  { id: cuid(), name: 'Shopping', type: 'expense' },
  { id: cuid(), name: 'Entertainment', type: 'expense' },
  { id: cuid(), name: 'Gifts', type: 'expense' },
  { id: cuid(), name: 'Travel', type: 'expense' },
  { id: cuid(), name: 'Recurring Deposit', type: 'expense' },
  { id: cuid(), name: 'Grooming', type: 'expense' },
  { id: cuid(), name: 'Others', type: 'expense' }
];

export const defaultIncomeCategories: Category[] = [
  { id: cuid(), name: 'Salary', type: 'income' },
  { id: cuid(), name: 'Freelance Income', type: 'income' },
  { id: cuid(), name: 'Bonus', type: 'income' },
  { id: cuid(), name: 'Investment Income', type: 'income' },
  { id: cuid(), name: 'Cashback', type: 'income' },
  { id: cuid(), name: 'Dividends', type: 'income' },
  { id: cuid(), name: 'Other Income', type: 'income' }
];

export const defaultCategories: Category[] = [
  ...defaultExpenseCategories,
  ...defaultIncomeCategories,
];

// Default Payment Methods based on the Google Sheet image
export const defaultPaymentMethods: PaymentMethod[] = [
  { id: cuid(), name: 'UPI (HDFC)', type: 'UPI' },
  { id: cuid(), name: 'CC HDFC 7950', type: 'Credit Card' },
  { id: cuid(), name: 'CC HDFC 8502', type: 'Credit Card' },
  { id: cuid(), name: 'CC ICICI 9007', type: 'Credit Card' },
  { id: cuid(), name: 'CC AXIS 6152', type: 'Credit Card' },
  { id: cuid(), name: 'CC SBI 0616', type: 'Credit Card' },
  { id: cuid(), name: 'CC YES 2106', type: 'Credit Card' },
  { id: cuid(), name: 'CC Tanshu', type: 'Credit Card' },
  { id: cuid(), name: 'Cash', type: 'Cash' },
  { id: cuid(), name: 'Others', type: 'Others' }
];
