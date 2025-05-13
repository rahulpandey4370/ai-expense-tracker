export type TransactionEnumType = "income" | "expense";
export type ExpenseEnumType = "need" | "want" | "investment_expense"; // Renamed to avoid conflict with Investment type

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
}

export interface Category {
  id: string;
  name: string;
  type: "expense" | "income";
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: "Credit Card" | "UPI" | "Cash" | "Bank Transfer";
}

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
