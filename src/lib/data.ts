
import type { Category, PaymentMethod, Transaction, ExpenseEnumType, TransactionEnumType } from './types';

// These lists are now primarily for populating dropdowns in the UI.
// The actual transaction data will come from the database.

export const expenseCategories: Category[] = [
  { id: 'cat1', name: 'Groceries (Honeydukes Haul)', type: 'expense' },
  { id: 'cat2', name: 'Transport (Broomstick/Apparition)', type: 'expense' },
  { id: 'cat3', name: 'Utilities (Owl Post/Ministry Fees)', type: 'expense' },
  { id: 'cat4', name: 'Entertainment (Quidditch/Hogsmeade)', type: 'expense' },
  { id: 'cat5', name: 'Healthcare (St. Mungo\'s Potions)', type: 'expense' },
  { id: 'cat6', name: 'Dining Out (Leaky Cauldron)', type: 'expense' },
  { id: 'cat7', name: 'Shopping (Diagon Alley Spree)', type: 'expense' },
  { id: 'cat8', name: 'Rent/Mortgage (The Burrow Upkeep)', type: 'expense'},
  { id: 'cat9', name: 'Other (Miscellaneous Magic)', type: 'expense' },
  { id: 'cat10', name: 'Investments (Gringotts Vault Deposit)', type: 'expense'},
];

export const incomeCategories: Category[] = [
  { id: 'inc1', name: 'Salary (Ministry/Hogwarts Pay)', type: 'income' },
  { id: 'inc2', name: 'Freelance (Potion Brewing/Spell Casting)', type: 'income' },
  { id: 'inc3', name: 'Bonus (Order of Merlin Award)', type: 'income' },
  { id: 'inc4', name: 'Investment Dividends (Goblin Gold Interest)', type: 'income'},
  { id: 'inc5', name: 'Kiwi Cashbacks (Magical Creatures Rewards)', type: 'income'},
  { id: 'inc6', name: 'Axis Bank CC Cashbacks', type: 'income' },
  { id: 'inc7', name: 'HDFC Bank CC Cashbacks', type: 'income' },
  { id: 'inc8', name: 'SBI CC Cashbacks', type: 'income' },
  { id: 'inc9', name: 'Amazon ICICI Bank CC Cashbacks', type: 'income' },
  { id: 'inc10', name: 'Cred Cashbacks (Wizarding Wheezes Points)', type: 'income' },
  { id: 'inc11', name: 'Other Income (Found Niffler Treasure)', type: 'income' },
];

export const paymentMethods: PaymentMethod[] = [
  { id: 'pm1', name: 'UPI (HDFC - Muggle Money Transfer)', type: 'UPI' },
  { id: 'pm2', name: 'Credit Card HDFC 7950', type: 'Credit Card' },
  { id: 'pm3', name: 'Credit Card HDFC 8502', type: 'Credit Card' },
  { id: 'pm4', name: 'Credit Card ICICI 9007', type: 'Credit Card' },
  { id: 'pm5', name: 'Credit Card AXIS 6152', type: 'Credit Card' },
  { id: 'pm6', name: 'Credit Card SBI 0616', type: 'Credit Card' },
  { id: 'pm7', name: 'Credit Card YES 2106', type: 'Credit Card' },
  { id: 'pm8', name: 'Tanshu Credit Card (Goblin Gold Card)', type: 'Credit Card' },
  { id: 'pm9', name: 'Cash (Galleons/Sickles/Knuts)', type: 'Cash' },
  { id: 'pm10', name: 'Others (Barter/Trade)', type: 'Others' },
];

// initialTransactions is no longer the source of truth.
// It can be removed or kept for seeding/testing if needed, but the app will fetch from DB.
export const initialTransactions: Transaction[] = [
  // This data is now illustrative and not used by the app's main flows.
  // Example:
  // {
  //   id: 'txn_example_income',
  //   type: 'income' as TransactionEnumType,
  //   date: new Date(),
  //   amount: 1000,
  //   source: 'Salary (Ministry/Hogwarts Pay)',
  //   description: 'Monthly Ministry Paycheck',
  // },
  // {
  //   id: 'txn_example_expense',
  //   type: 'expense' as TransactionEnumType,
  //   date: new Date(),
  //   amount: 50,
  //   description: 'Bertie Bott\'s Every Flavor Beans',
  //   category: 'Groceries (Honeydukes Haul)',
  //   paymentMethod: 'Cash (Galleons/Sickles/Knuts)',
  //   expenseType: 'want' as ExpenseEnumType,
  // },
];
