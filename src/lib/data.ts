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
  { id: 'cat10', name: 'Investments', type: 'expense'},
];

export const incomeCategories: Category[] = [
  { id: 'inc1', name: 'Salary', type: 'income' },
  { id: 'inc2', name: 'Freelance', type: 'income' },
  { id: 'inc3', name: 'Bonus', type: 'income' },
  { id: 'inc4', name: 'Investment Dividends', type: 'income'},
  { id: 'inc5', name: 'Kiwi Cashbacks', type: 'income'},
  { id: 'inc6', name: 'Axis Bank CC Cashbacks', type: 'income' },
  { id: 'inc7', name: 'HDFC Bank CC Cashbacks', type: 'income' },
  { id: 'inc8', name: 'SBI CC Cashbacks', type: 'income' },
  { id: 'inc9', name: 'Amazon ICICI Bank CC Cashbacks', type: 'income' },
  { id: 'inc10', name: 'Cred Cashbacks', type: 'income' },
  { id: 'inc11', name: 'Other Income', type: 'income' },
];

export const paymentMethods: PaymentMethod[] = [
  { id: 'pm1', name: 'UPI (HDFC)', type: 'UPI' },
  { id: 'pm2', name: 'Credit Card HDFC 7950', type: 'Credit Card' },
  { id: 'pm3', name: 'Credit Card HDFC 8502', type: 'Credit Card' },
  { id: 'pm4', name: 'Credit Card ICICI 9007', type: 'Credit Card' },
  { id: 'pm5', name: 'Credit Card AXIS 6152', type: 'Credit Card' },
  { id: 'pm6', name: 'Credit Card SBI 0616', type: 'Credit Card' },
  { id: 'pm7', name: 'Credit Card YES 2106', type: 'Credit Card' },
  { id: 'pm8', name: 'Tanshu Credit Card', type: 'Credit Card' },
  { id: 'pm9', name: 'Cash', type: 'Cash' },
  { id: 'pm10', name: 'Others', type: 'Others' },
];

const today = new Date();
const currentMonth = today.getMonth();
const currentYear = today.getFullYear();

const getDate = (monthOffset: number, day: number): Date => {
  const date = new Date(currentYear, currentMonth, day);
  date.setMonth(date.getMonth() - monthOffset);
  return date;
}

export const initialTransactions: Transaction[] = [
  // Current Month Transactions
  {
    id: 'txn1',
    type: 'income' as TransactionEnumType,
    date: getDate(0, 1),
    amount: 75000, // Adjusted for INR & current month
    source: 'Salary',
    description: 'Monthly Salary',
  },
  {
    id: 'txn2',
    type: 'expense' as TransactionEnumType,
    date: getDate(0, 2),
    amount: 32000, 
    description: 'Rent',
    category: 'Rent/Mortgage',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn3',
    type: 'expense' as TransactionEnumType,
    date: getDate(0, 3),
    amount: 1200, 
    description: 'Lunch with colleagues',
    category: 'Dining Out',
    paymentMethod: 'Credit Card HDFC 7950',
    expenseType: 'want' as ExpenseEnumType,
  },
  {
    id: 'txn4',
    type: 'expense' as TransactionEnumType,
    date: getDate(0, 5),
    amount: 1200, 
    description: 'Swiggy Instamart Meds',
    category: 'Healthcare',
    paymentMethod: 'Tanshu Credit Card',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn5',
    type: 'expense' as TransactionEnumType,
    date: getDate(0, 7),
    amount: 1500, 
    description: 'Movie Tickets',
    category: 'Entertainment',
    paymentMethod: 'Credit Card SBI 0616',
    expenseType: 'want' as ExpenseEnumType,
  },
  {
    id: 'txn6',
    type: 'expense' as TransactionEnumType,
    date: getDate(0, 10),
    amount: 10000, 
    description: 'Stock Investment',
    category: 'Investments',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'investment_expense' as ExpenseEnumType,
  },
  {
    id: 'txn_curr_groceries',
    type: 'expense' as TransactionEnumType,
    date: getDate(0, 12),
    amount: 5500,
    description: 'Weekly Groceries',
    category: 'Groceries',
    paymentMethod: 'Credit Card ICICI 9007',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn_curr_util',
    type: 'expense' as TransactionEnumType,
    date: getDate(0, 15),
    amount: 2500,
    description: 'Electricity Bill',
    category: 'Utilities',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'need' as ExpenseEnumType,
  },

  // Last Month (Month -1) Transactions
  {
    id: 'txn_m1_income',
    type: 'income' as TransactionEnumType,
    date: getDate(1, 1),
    amount: 74000,
    source: 'Salary',
    description: 'Monthly Salary (Previous Month)',
  },
  {
    id: 'txn_m1_rent',
    type: 'expense' as TransactionEnumType,
    date: getDate(1, 2),
    amount: 32000,
    description: 'Rent (Previous Month)',
    category: 'Rent/Mortgage',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn_m1_groceries',
    type: 'expense' as TransactionEnumType,
    date: getDate(1, 5),
    amount: 6000,
    description: 'Groceries (Previous Month)',
    category: 'Groceries',
    paymentMethod: 'Credit Card AXIS 6152',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn_m1_dining',
    type: 'expense' as TransactionEnumType,
    date: getDate(1, 10),
    amount: 2500,
    description: 'Dinner Out (Previous Month)',
    category: 'Dining Out',
    paymentMethod: 'Credit Card HDFC 7950',
    expenseType: 'want' as ExpenseEnumType,
  },
   {
    id: 'txn_m1_investment',
    type: 'expense' as TransactionEnumType,
    date: getDate(1, 15),
    amount: 5000,
    description: 'Mutual Fund SIP',
    category: 'Investments',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'investment_expense' as ExpenseEnumType,
  },

  // Month -2 Transactions
  {
    id: 'txn_m2_income',
    type: 'income' as TransactionEnumType,
    date: getDate(2, 1),
    amount: 73500,
    source: 'Salary',
    description: 'Monthly Salary (M-2)',
  },
  {
    id: 'txn_m2_rent',
    type: 'expense' as TransactionEnumType,
    date: getDate(2, 2),
    amount: 31000, // Slightly different rent
    description: 'Rent (M-2)',
    category: 'Rent/Mortgage',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn_m2_shopping',
    type: 'expense' as TransactionEnumType,
    date: getDate(2, 12),
    amount: 4000,
    description: 'Online Shopping (M-2)',
    category: 'Shopping',
    paymentMethod: 'Credit Card SBI 0616',
    expenseType: 'want' as ExpenseEnumType,
  },
  {
    id: 'txn_m2_utilities',
    type: 'expense' as TransactionEnumType,
    date: getDate(2, 18),
    amount: 2200,
    description: 'Internet Bill (M-2)',
    category: 'Utilities',
    paymentMethod: 'Credit Card HDFC 8502',
    expenseType: 'need' as ExpenseEnumType,
  },

  // Month -3 Transactions
  {
    id: 'txn_m3_income',
    type: 'income' as TransactionEnumType,
    date: getDate(3, 1),
    amount: 73000,
    source: 'Salary',
    description: 'Monthly Salary (M-3)',
  },
  {
    id: 'txn_m3_rent',
    type: 'expense' as TransactionEnumType,
    date: getDate(3, 2),
    amount: 31000,
    description: 'Rent (M-3)',
    category: 'Rent/Mortgage',
    paymentMethod: 'UPI (HDFC)',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn_m3_groceries',
    type: 'expense' as TransactionEnumType,
    date: getDate(3, 7),
    amount: 5000,
    description: 'Groceries (M-3)',
    category: 'Groceries',
    paymentMethod: 'Credit Card ICICI 9007',
    expenseType: 'need' as ExpenseEnumType,
  },
  {
    id: 'txn_m3_transport',
    type: 'expense' as TransactionEnumType,
    date: getDate(3, 20),
    amount: 1800,
    description: 'Petrol (M-3)',
    category: 'Transport',
    paymentMethod: 'Cash',
    expenseType: 'need' as ExpenseEnumType,
  },
];
