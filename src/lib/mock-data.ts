
import type { RawTransaction, Category, PaymentMethod } from './types';

export const mockCategories: Category[] = [
  { id: 'cat-food', name: 'Food and Dining', type: 'expense' },
  { id: 'cat-groceries', name: 'Groceries', type: 'expense' },
  { id: 'cat-transport', name: 'Auto & Transportation', type: 'expense' },
  { id: 'cat-utilities', name: 'Utilities', type: 'expense' },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense' },
  { id: 'cat-investment', name: 'Stocks', type: 'expense' },
  { id: 'cat-salary', name: 'Salary', type: 'income' },
  { id: 'cat-bonus', name: 'Bonus', type: 'income' },
];

export const mockPaymentMethods: PaymentMethod[] = [
  { id: 'pm-cc-hdfc', name: 'CC HDFC 7950', type: 'Credit Card' },
  { id: 'pm-upi', name: 'UPI (HDFC)', type: 'UPI' },
  { id: 'pm-cash', name: 'Cash', type: 'Cash' },
];

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth();

const generateTransactionsForMonth = (year: number, month: number): RawTransaction[] => {
  return [
    // Income
    {
      id: `mock-inc-${year}-${month}-1`, type: 'income', date: new Date(year, month, 1).toISOString(),
      amount: 75000, description: 'Monthly Salary', categoryId: 'cat-salary',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    // Expenses
    {
      id: `mock-exp-${year}-${month}-1`, type: 'expense', date: new Date(year, month, 2).toISOString(),
      amount: 2500.75, description: 'Weekly Groceries', categoryId: 'cat-groceries',
      paymentMethodId: 'pm-upi', expenseType: 'need', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: `mock-exp-${year}-${month}-2`, type: 'expense', date: new Date(year, month, 5).toISOString(),
      amount: 1200, description: 'Dinner with friends', categoryId: 'cat-food',
      paymentMethodId: 'pm-cc-hdfc', expenseType: 'want', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: `mock-exp-${year}-${month}-3`, type: 'expense', date: new Date(year, month, 7).toISOString(),
      amount: 850, description: 'Electricity Bill', categoryId: 'cat-utilities',
      paymentMethodId: 'pm-upi', expenseType: 'need', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: `mock-exp-${year}-${month}-4`, type: 'expense', date: new Date(year, month, 10).toISOString(),
      amount: 5000, description: 'Stock Investment: TATA', categoryId: 'cat-investment',
      paymentMethodId: 'pm-upi', expenseType: 'investment_expense', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: `mock-exp-${year}-${month}-5`, type: 'expense', date: new Date(year, month, 15).toISOString(),
      amount: 450, description: 'Uber to office', categoryId: 'cat-transport',
      paymentMethodId: 'pm-cc-hdfc', expenseType: 'need', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
        id: `mock-exp-${year}-${month}-6`, type: 'expense', date: new Date(year, month, 20).toISOString(),
        amount: 3200, description: 'New headphones', categoryId: 'cat-shopping',
        paymentMethodId: 'pm-cc-hdfc', expenseType: 'want', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ];
};

export const mockTransactions: RawTransaction[] = [
  ...generateTransactionsForMonth(currentYear, currentMonth),
  ...generateTransactionsForMonth(currentYear, currentMonth - 1),
  ...generateTransactionsForMonth(currentYear, currentMonth - 2),
  ...generateTransactionsForMonth(currentYear, currentMonth - 3),
];
