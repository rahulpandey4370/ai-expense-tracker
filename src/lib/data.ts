
import type { Category, PaymentMethod, Transaction, ExpenseEnumType, TransactionEnumType } from './types';

// Categories based on the provided Google Sheet
export const expenseCategories: Category[] = [
  { id: 'cat_food_dining', name: 'Food and Dining', type: 'expense' },
  { id: 'cat_groceries', name: 'Groceries', type: 'expense' },
  { id: 'cat_rent', name: 'Rent', type: 'expense' },
  { id: 'cat_auto_transport', name: 'Auto & Transportation', type: 'expense' },
  { id: 'cat_loan_repayment', name: 'Loan Repayment', type: 'expense' },
  { id: 'cat_stocks', name: 'Stocks', type: 'expense' }, // Considered an investment expense
  { id: 'cat_mutual_funds', name: 'Mutual Funds', type: 'expense' }, // Considered an investment expense
  { id: 'cat_utilities', name: 'Utilities', type: 'expense' },
  { id: 'cat_education', name: 'Education', type: 'expense' },
  { id: 'cat_subscriptions', name: 'Subscriptions', type: 'expense' },
  { id: 'cat_home_expense', name: 'Home Expense', type: 'expense' },
  { id: 'cat_maid', name: 'Maid', type: 'expense' },
  { id: 'cat_fitness', name: 'Fitness', type: 'expense' },
  { id: 'cat_shopping', name: 'Shopping', type: 'expense' },
  { id: 'cat_entertainment', name: 'Entertainment', type: 'expense' },
  { id: 'cat_gifts', name: 'Gifts', type: 'expense' },
  { id: 'cat_travel', name: 'Travel', type: 'expense' },
  { id: 'cat_recurring_deposit', name: 'Recurring Deposit', type: 'expense' }, // Considered an investment expense
  { id: 'cat_grooming', name: 'Grooming', type: 'expense' },
  { id: 'cat_other', name: 'Others', type: 'expense' },
];

export const incomeCategories: Category[] = [
  { id: 'inc_salary', name: 'Salary', type: 'income' },
  { id: 'inc_freelance', name: 'Freelance Income', type: 'income' },
  { id: 'inc_bonus', name: 'Bonus', type: 'income' },
  { id: 'inc_investment', name: 'Investment Income', type: 'income' },
  { id: 'inc_cashback', name: 'Cashback', type: 'income' },
  { id: 'inc_other', name: 'Other Income', type: 'income' },
];

export const paymentMethods: PaymentMethod[] = [
  { id: 'pm_upi_hdfc', name: 'UPI (HDFC)', type: 'UPI' },
  { id: 'pm_cc_hdfc_7950', name: 'CC HDFC 7950', type: 'Credit Card' },
  { id: 'pm_cc_hdfc_8502', name: 'CC HDFC 8502', type: 'Credit Card' },
  { id: 'pm_cc_icici_9007', name: 'CC ICICI 9007', type: 'Credit Card' },
  { id: 'pm_cc_axis_6152', name: 'CC AXIS 6152', type: 'Credit Card' },
  { id: 'pm_cc_sbi_0616', name: 'CC SBI 0616', type: 'Credit Card' },
  { id: 'pm_cc_yes_2106', name: 'CC YES 2106', type: 'Credit Card' },
  { id: 'pm_cc_tanshu', name: 'CC Tanshu', type: 'Credit Card' },
  { id: 'pm_cash', name: 'Cash', type: 'Cash' },
  { id: 'pm_others', name: 'Others', type: 'Others' },
];

// initialTransactions will be the in-memory store.
// Start with an empty array or a few sample transactions if needed for initial view.
export let initialTransactions: Transaction[] = [
  // Example of an income transaction:
  {
    id: crypto.randomUUID(),
    type: 'income' as TransactionEnumType,
    date: new Date(2024, 6, 1), // July 1, 2024
    amount: 50000,
    source: 'Salary',
    description: 'Monthly Salary',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Example of an expense transaction:
  {
    id: crypto.randomUUID(),
    type: 'expense' as TransactionEnumType,
    date: new Date(2024, 6, 5), // July 5, 2024
    amount: 2500,
    description: 'Weekly Groceries',
    category: 'Groceries',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'need' as ExpenseEnumType,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
    {
    id: crypto.randomUUID(),
    type: 'expense' as TransactionEnumType,
    date: new Date(2024, 5, 10), // June 10, 2024
    amount: 1200,
    description: 'Dinner with friends',
    category: 'Food and Dining',
    paymentMethod: 'CC HDFC 7950',
    expenseType: 'want' as ExpenseEnumType,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
