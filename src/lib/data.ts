import type { Category, PaymentMethod, Transaction, ExpenseEnumType, TransactionEnumType } from './types';

export const expenseCategories: Category[] = [
  { id: 'cat1', name: 'Groceries', type: 'expense' },
  { id: 'cat2', name: 'Transport', type: 'expense' },
  { id: 'cat3', name: 'Utilities', type: 'expense' },
  { id: 'cat4', name: 'Entertainment', type: 'expense' },
  { id: 'cat5', name: 'Healthcare', type: 'expense' },
  { id: 'cat6', name: 'Dining Out', type: 'expense' },
  { id: 'cat7', name: 'Shopping', type: 'expense' },
  { id: 'cat8', name: 'Rent/Mortgage', type: 'expense'},
  { id: 'cat9', name: 'Other', type: 'expense' },
];

export const incomeCategories: Category[] = [
  { id: 'inc1', name: 'Salary', type: 'income' },
  { id: 'inc2', name: 'Freelance', type: 'income' },
  { id: 'inc3', name: 'Bonus', type: 'income' },
  { id: 'inc4', name: 'Investment Dividends', type: 'income'},
  { id: 'inc5', name: 'Other Income', type: 'income' },
];

export const paymentMethods: PaymentMethod[] = [
  { id: 'pm1', name: 'Credit Card Alpha', type: 'Credit Card' },
  { id: 'pm2', name: 'Credit Card Beta', type: 'Credit Card' },
  { id: 'pm3', name: 'UPI Gamma', type: 'UPI' },
  { id: 'pm4', name: 'UPI Delta', type: 'UPI' },
  { id: 'pm5', name: 'Cash', type: 'Cash' },
  { id: 'pm6', name: 'Bank Transfer Epsilon', type: 'Bank Transfer' },
];

export const initialTransactions: Transaction[] = [
  {
    id: 'txn1',
    type: 'income' as TransactionEnumType,
    date: new Date(new Date().setDate(1)),
    amount: 5000,
    source: 'Salary',
    description: 'Monthly Salary',
  },
  {
    id: 'txn2',
    type: 'expense' as TransactionEnumType,
    date: new Date(new Date().setDate(2)),
    amount: 75,
    description: 'Weekly Groceries',
    category: 'Groceries',
    paymentMethod: 'Credit Card Alpha',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn3',
    type: 'expense' as TransactionEnumType,
    date: new Date(new Date().setDate(3)),
    amount: 30,
    description: 'Lunch with colleagues',
    category: 'Dining Out',
    paymentMethod: 'UPI Gamma',
    expenseType: 'want' as ExpenseEnumType,
  },
  {
    id: 'txn4',
    type: 'expense' as TransactionEnumType,
    date: new Date(new Date().setDate(5)),
    amount: 1200,
    description: 'Monthly Rent',
    category: 'Rent/Mortgage',
    paymentMethod: 'Bank Transfer Epsilon',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn5',
    type: 'expense' as TransactionEnumType,
    date: new Date(new Date().setDate(7)),
    amount: 50,
    description: 'Movie Tickets',
    category: 'Entertainment',
    paymentMethod: 'Credit Card Beta',
    expenseType: 'want' as ExpenseEnumType,
  },
  {
    id: 'txn6',
    type: 'expense' as TransactionEnumType,
    date: new Date(new Date().setDate(10)),
    amount: 200,
    description: 'Stock Investment',
    category: 'Investments', // This could be a special category
    paymentMethod: 'Bank Transfer Epsilon',
    expenseType: 'investment_expense' as ExpenseEnumType,
  },
];
