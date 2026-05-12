import { z } from 'zod';

// AI Model Selection
export const modelNames = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gpt-5.2-chat'] as const;
export type AIModel = (typeof modelNames)[number];


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

// This is the raw transaction structure as it might be stored
// It uses IDs for category and paymentMethod
export interface RawTransaction {
  id: string;
  type: 'income' | 'expense';
  date: string; // YYYY-MM-DD string format
  amount: number;
  description: string;
  categoryId?: string;
  paymentMethodId?: string;
  source?: string;
  expenseType?: 'need' | 'want' | 'investment' | 'investment_expense';
  isSplit?: boolean; // New field for split indicator
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  // For cosmos DB
  _rid?: string;
  _self?: string;
  _etag?: string;
  _attachments?: string;
  _ts?: number;
}

// This is the "hydrated" transaction type used by the frontend,
// where category and paymentMethod are populated objects.
export interface AppTransaction extends Omit<RawTransaction, 'categoryId' | 'paymentMethodId' | 'date' | 'createdAt' | 'updatedAt' | 'expenseType'> {
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  category?: Category;
  paymentMethod?: PaymentMethod;
  expenseType?: 'need' | 'want' | 'investment'; // Simplified for frontend
}

// Zod schema for validating transaction input for Server Actions
export const TransactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  date: z.date(),
  amount: z.number().gt(0, "Amount must be a positive number."),
  description: z.string().min(1, "Description is required."),
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  source: z.string().optional(),
  expenseType: z.enum(['need', 'want', 'investment', 'investment_expense']).optional(),
  isSplit: z.boolean().optional(), // New field for split indicator
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

// --- Recurring Transactions (Option A: lazy materialization) ---
export const RecurringRuleInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().gt(0),
  description: z.string().min(1),
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  source: z.string().optional(),
  expenseType: z.enum(['need', 'want', 'investment', 'investment_expense']).optional(),
  dayOfMonth: z.number().int().min(1).max(31).describe("Calendar day each month the transaction is automatically created. If month has fewer days, the last day of the month is used."),
  startDate: z.string().describe("YYYY-MM-DD; first month from which the rule is active."),
  endDate: z.string().optional().describe("YYYY-MM-DD; last month inclusive, optional."),
  isActive: z.boolean().default(true),
}).refine(data => {
  if (data.type === 'expense') return !!data.categoryId && !!data.paymentMethodId && !!data.expenseType;
  return true;
}, { message: "Expense rules need category, payment method, and expense type." });

export type RecurringRuleInput = z.infer<typeof RecurringRuleInputSchema>;

export interface RecurringRule extends RecurringRuleInput {
  id: string;
  lastGeneratedDate?: string; // YYYY-MM-DD of the most recent materialized instance
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// --- Cash Savings Allocations ---
// User-tracked record of where their cash savings sit (savings account, liquid
// fund, FD, etc.) so they can see at a glance how much money is parked where.
export const SavingsAllocationCategoryEnum = z.enum([
  'savings_account', 'liquid_fund', 'fd', 'rd', 'cash', 'other',
]);
export type SavingsAllocationCategory = z.infer<typeof SavingsAllocationCategoryEnum>;

export const SavingsAllocationInputSchema = z.object({
  name: z.string().min(1, "Name is required.").describe("Short label, e.g. 'Emergency Fund'."),
  location: z.string().min(1, "Location is required.").describe("Where the money sits, e.g. 'HDFC Savings A/c', 'Quant Liquid Fund'."),
  category: SavingsAllocationCategoryEnum,
  amount: z.number().gt(0, "Amount must be positive."),
  asOfDate: z.string().describe("YYYY-MM-DD; the date this balance was last verified."),
  notes: z.string().optional(),
});
export type SavingsAllocationInput = z.infer<typeof SavingsAllocationInputSchema>;

export interface SavingsAllocation extends SavingsAllocationInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// --- Portfolio Tracking ---
export const PortfolioAssetTypeEnum = z.enum([
  'mutual_fund',
  'indian_equity',
  'us_equity',
  'crypto',
  'gold',
  'fd_rd',
  'other',
]);
export type PortfolioAssetType = z.infer<typeof PortfolioAssetTypeEnum>;

export const PortfolioCurrencyEnum = z.enum(['INR', 'USD']);
export type PortfolioCurrency = z.infer<typeof PortfolioCurrencyEnum>;

export const PortfolioTransactionTypeEnum = z.enum([
  'buy',
  'sell',
  'dividend',
  'interest',
  'fee',
]);
export type PortfolioTransactionType = z.infer<typeof PortfolioTransactionTypeEnum>;

export const PortfolioEntrySourceEnum = z.enum(['manual', 'ai_text', 'screenshot']);
export type PortfolioEntrySource = z.infer<typeof PortfolioEntrySourceEnum>;

export interface PortfolioBaseDocument {
  id: string;
  userId: string;
  docType: 'asset' | 'transaction' | 'valuation' | 'ai_import';
  createdAt: string;
  updatedAt?: string;
}

export const PortfolioAssetInputSchema = z.object({
  name: z.string().min(1, "Asset name is required."),
  assetType: PortfolioAssetTypeEnum.default('other'),
  symbol: z.string().optional(),
  isin: z.string().optional(),
  schemeCode: z.string().optional(),
  currency: PortfolioCurrencyEnum.default('INR'),
  notes: z.string().optional(),
});
export type PortfolioAssetInput = z.infer<typeof PortfolioAssetInputSchema>;

export interface PortfolioAsset extends PortfolioBaseDocument, PortfolioAssetInput {
  docType: 'asset';
}

export const PortfolioTransactionInputSchema = z.object({
  assetId: z.string().optional(),
  assetName: z.string().min(1, "Fund/stock name is required."),
  assetType: PortfolioAssetTypeEnum.default('other'),
  type: PortfolioTransactionTypeEnum,
  date: z.string().min(1, "Date is required."),
  amount: z.number().gt(0, "Amount must be positive."),
  quantity: z.number().gt(0).optional(),
  pricePerUnit: z.number().gt(0).optional(),
  charges: z.number().min(0).optional(),
  taxes: z.number().min(0).optional(),
  currency: PortfolioCurrencyEnum.default('INR'),
  notes: z.string().optional(),
  source: PortfolioEntrySourceEnum.default('manual'),
});
export type PortfolioTransactionInput = z.infer<typeof PortfolioTransactionInputSchema>;

export interface PortfolioTransaction extends PortfolioBaseDocument, Omit<PortfolioTransactionInput, 'assetId'> {
  docType: 'transaction';
  assetId: string;
}

export const PortfolioValuationInputSchema = z.object({
  assetId: z.string().optional(),
  assetName: z.string().min(1, "Fund/stock name is required."),
  assetType: PortfolioAssetTypeEnum.default('other'),
  date: z.string().min(1, "Date is required."),
  totalValue: z.number().gt(0, "Current value must be positive."),
  quantity: z.number().gt(0).optional(),
  pricePerUnit: z.number().gt(0).optional(),
  currency: PortfolioCurrencyEnum.default('INR'),
  notes: z.string().optional(),
  source: PortfolioEntrySourceEnum.default('manual'),
});
export type PortfolioValuationInput = z.infer<typeof PortfolioValuationInputSchema>;

export interface PortfolioValuation extends PortfolioBaseDocument, Omit<PortfolioValuationInput, 'assetId'> {
  docType: 'valuation';
  assetId: string;
}

export interface PortfolioAIImport extends PortfolioBaseDocument {
  docType: 'ai_import';
  inputType: 'text' | 'screenshot';
  rawText?: string;
  parsedJson: unknown;
  createdRecordIds: string[];
}

export const PortfolioEntryInputSchema = z.discriminatedUnion('entryKind', [
  PortfolioTransactionInputSchema.extend({ entryKind: z.literal('transaction') }),
  PortfolioValuationInputSchema.extend({ entryKind: z.literal('valuation') }),
]);
export type PortfolioEntryInput = z.infer<typeof PortfolioEntryInputSchema>;

export interface PortfolioAssetSummary {
  asset: PortfolioAsset;
  transactions: PortfolioTransaction[];
  valuations: PortfolioValuation[];
  totalInvested: number;
  totalOutflows: number;
  totalInflows: number;
  currentValue: number;
  latestValuation?: PortfolioValuation;
  netPnl: number;
  netPnlPercent: number | null;
  xirr: number | null;
  holdingDays: number | null;
  transactionCount: number;
}

export interface PortfolioDashboardSummary {
  totalInvested: number;
  totalCurrentValue: number;
  totalInflows: number;
  netPnl: number;
  netPnlPercent: number | null;
  xirr: number | null;
  assetCount: number;
  transactionCount: number;
  latestUpdateDate?: string;
  bestPerformer?: PortfolioAssetSummary;
  worstPerformer?: PortfolioAssetSummary;
}

export interface PortfolioDashboardData {
  assets: PortfolioAsset[];
  transactions: PortfolioTransaction[];
  valuations: PortfolioValuation[];
  assetSummaries: PortfolioAssetSummary[];
  summary: PortfolioDashboardSummary;
}

// Derived types for UI convenience, if needed
export type TransactionType = 'income' | 'expense';
export type ExpenseType = 'need' | 'want' | 'investment' | 'investment_expense';


// Zod schema for a single transaction parsed by AI from text
export const ParsedAITransactionSchema = z.object({
  date: z.string().describe("The transaction date in YYYY-MM-DD format. Infer based on text and current date if relative (e.g., 'yesterday')."),
  description: z.string().describe("A concise description of the transaction. For purchases, include merchant and a few key items (e.g., 'Zepto Groceries: Milk, Curd, Banana')."),
  amount: z.number().min(0.01).describe("The transaction amount as a positive number."),
  type: z.enum(['income', 'expense']).describe("The type of transaction."),
  categoryNameGuess: z.string().optional().describe("The best guess for the category name from the provided list. If an exact match is not found, use the closest one or 'Others' if applicable. If no category seems to fit, leave blank."),
  paymentMethodNameGuess: z.string().optional().describe("If it's an expense, the best guess for the payment method name from the provided list. If no payment method seems to fit or it's an income, leave blank."),
  expenseTypeNameGuess: z.enum(['need', 'want', 'investment', 'investment_expense']).optional().describe("If it's an expense, guess its type: 'need', 'want', or 'investment' or 'investment_expense'. If not clearly identifiable or income, leave blank."),
  sourceGuess: z.string().optional().describe("If it's an income, a brief description of the source (e.g., 'Salary from X', 'Freelance Project Y'). If not clearly identifiable or expense, leave blank."),
  confidenceScore: z.number().min(0).max(1).optional().describe("AI's confidence in parsing this specific transaction (0.0 to 1.0). 1.0 means very confident."),
  error: z.string().optional().describe("If this specific part of the text couldn't be parsed as a valid transaction, provide a brief error message here."),
  splitDetails: z.object({
    participants: z.array(z.string()).describe("List of participant names mentioned in the split, e.g., ['me', 'Rahul', 'Priya']. 'me' or 'I' should be standardized to 'me'."),
    splitRatio: z.string().optional().describe("The ratio of the split if specified, e.g., '50-50', 'equally'.")
  }).optional().describe("If the text mentions splitting the bill, populate this object."),
  model: z.enum(modelNames).optional(),
});
export type ParsedAITransaction = z.infer<typeof ParsedAITransactionSchema>;


// Zod schema for the structure of a single transaction parsed by AI from a receipt image
export const ParsedReceiptTransactionSchema = z.object({
  date: z.string().optional().describe("The transaction date from the receipt in YYYY-MM-DD format. If unidentifiable, leave blank."),
  description: z.string().optional().describe("The merchant name or a concise description of the transaction from the receipt. If unidentifiable, leave blank."),
  amount: z.number().min(0.01, "Amount must be positive.").optional().describe("The total transaction amount as a positive number. If unidentifiable, leave blank."),
  categoryNameGuess: z.string().optional().describe("The best guess for the category name from the provided list based on items or merchant. If unsure, use 'Others' or leave blank."),
  paymentMethodNameGuess: z.string().optional().describe("The best guess for the payment method name from the provided list (e.g., 'Credit Card', 'Cash') if discernible. If unsure, leave blank."),
  expenseTypeNameGuess: z.enum(['need', 'want', 'investment', 'investment_expense']).optional().describe("Guess its type: 'need', 'want', 'investment', or 'investment_expense'. If not clearly identifiable, leave blank."),
  confidenceScore: z.number().min(0).max(1).optional().describe("AI's confidence in parsing this receipt (0.0 to 1.0)."),
  error: z.string().optional().describe("If the receipt couldn't be parsed reliably or is unreadable, provide a brief error message here."),
  model: z.enum(modelNames).optional(),
});
export type ParsedReceiptTransaction = z.infer<typeof ParsedReceiptTransactionSchema>;


// AI Goal Forecaster Schemas
export const GoalForecasterInputSchema = z.object({
  goalDescription: z.string().min(1, "Goal description is required.").describe("The user's description of their financial goal (e.g., 'Save for a vacation to Europe', 'Buy a new gaming laptop')."),
  goalAmount: z.number().min(0.01).optional().describe("The target monetary amount for the goal in INR. If not provided, AI should estimate this based on the description."),
  goalDurationMonths: z.number().int().min(1).describe("The desired duration in months to achieve the goal."),
  averageMonthlyIncome: z.number().min(0).describe("The user's average monthly income in INR based on recent data. Can be 0."),
  averageMonthlyExpenses: z.number().min(0).describe("The user's average monthly expenses (excluding dedicated savings/investments for this specific goal) in INR based on recent data. Can be 0."),
  currentSavingsRate: z.number().min(0).max(100).describe("The user's current approximate savings rate as a percentage of income (e.g., 20 for 20%)."),
  model: z.enum(modelNames).optional(),
});
export type GoalForecasterInput = z.infer<typeof GoalForecasterInputSchema>;

export const GoalForecasterOutputSchema = z.object({
  feasibilityAssessment: z.string().describe("A brief assessment of whether the goal is feasible within the given timeframe based on current financials (e.g., 'Highly Feasible', 'Challenging but Possible', 'Likely Unfeasible without changes')."),
  projectedMonthsToGoal: z.number().int().min(1).optional().describe("If feasible or challenging, the AI's projected number of months to reach the goal with current savings habits. Omit if unfeasible. Must be a positive integer if provided."),
  requiredMonthlySavings: z.number().min(0.01).describe("The amount the user would need to save specifically for this goal each month to achieve it in the desired duration. Must be a positive number."),
  suggestedActions: z.array(z.string()).describe("A list of 2-4 actionable suggestions to help achieve the goal. These could include increasing savings by a certain amount, or reducing spending in specific categories (e.g., 'Reduce 'Food and Dining' by X%', 'Increase monthly savings by ₹Y'). Be specific with INR amounts where possible."),
  motivationalMessage: z.string().optional().describe("A short, encouraging message for the user."),
  estimatedOrProvidedGoalAmount: z.number().min(0.01).describe("The goal amount used for forecasting, either user-provided or AI-estimated, in INR."),
  wasAmountEstimatedByAI: z.boolean().describe("True if the goal amount was estimated by the AI, false if provided by the user."),
  model: z.enum(modelNames).optional(),
});
export type GoalForecasterOutput = z.infer<typeof GoalForecasterOutputSchema>;


// AI Budgeting Assistant Schemas
export const BudgetingAssistantInputSchema = z.object({
  statedMonthlyIncome: z.number().min(0).describe("User's stated monthly income in INR. Can be 0 if not provided recently."),
  statedMonthlySavingsGoalPercentage: z.number().min(0).max(100).describe("User's desired savings rate as a percentage of income (e.g., 20 for 20%)."),
  averagePastMonthlyExpenses: z.number().min(0).describe("User's average total monthly expenses in INR, calculated from the last 3 months of their transaction data. Can be 0."),
  pastSpendingBreakdown: z.string().describe("A summary of the user's average monthly spending breakdown from the last 3 months. Example: 'Average spending: Needs: ₹30000 (e.g., Rent: ₹15000, Groceries: ₹8000), Wants: ₹15000 (e.g., Dining Out: ₹7000, Shopping: ₹5000), Investments: ₹5000 (e.g., Mutual Funds: ₹5000).' Include specific category examples if available."),
  model: z.enum(modelNames).optional(),
});
export type BudgetingAssistantInput = z.infer<typeof BudgetingAssistantInputSchema>;

export const BudgetingAssistantOutputSchema = z.object({
  recommendedMonthlyBudget: z.object({
    needs: z.number().min(0).describe("Recommended monthly spending for 'Needs' in INR."),
    wants: z.number().min(0).describe("Recommended monthly spending for 'Wants' in INR."),
    investmentsAsSpending: z.number().min(0).describe("Recommended monthly allocation for 'Investments' (treated as an expense category like SIPs, stock purchases) in INR. This is separate from pure 'Savings'."),
    targetSavings: z.number().min(0).describe("The target amount to be saved each month based on the user's income and savings goal percentage, in INR. This is pure cash savings or unallocated investment funds."),
    discretionarySpendingOrExtraSavings: z.number().min(0).describe("Remaining amount after allocating to needs, wants, investments (as spending), and target savings. This can be used for flexible spending or additional savings/investments, in INR."),
  }).describe("The AI's recommended monthly budget breakdown in INR."),
  detailedSuggestions: z.object({
    categoryAdjustments: z.array(z.string()).describe("Specific suggestions for adjusting spending in certain categories to meet the budget and savings goals. E.g., 'Consider reducing 'Dining Out' expenses by approximately ₹500.' or 'Allocate ₹X towards your Mutual Fund SIP.'"),
    generalTips: z.array(z.string()).describe("General financial tips to help the user stick to the budget and improve savings. E.g., 'Review subscriptions for potential cuts.' or 'Set up automatic transfers to your savings account on payday.'"),
  }).describe("Actionable advice to help the user achieve their financial plan."),
  analysisSummary: z.string().describe("A brief overall analysis comparing the suggested budget to past spending habits and explaining how it helps achieve the savings goal. Mention any significant changes required."),
  model: z.enum(modelNames).optional(),
});
export type BudgetingAssistantOutput = z.infer<typeof BudgetingAssistantOutputSchema>;


// Goal Tracking Schemas
export const GoalInputSchema = z.object({
  description: z.string().min(1, "Goal description is required."),
  targetAmount: z.number().min(0.01, "Target amount must be positive."),
  targetDurationMonths: z.number().int().min(1, "Duration must be at least 1 month."),
  initialRequiredMonthlySavings: z.number().min(0).optional(),
});
export type GoalInput = z.infer<typeof GoalInputSchema>;

export interface FundAllocation {
  id: string; // Unique ID for the allocation
  name: string; // e.g., 'HDFC Savings Account', 'Parag Parikh MF'
  amount: number;
  createdAt: string; // ISO string date
  updatedAt: string; // ISO string date
}

export interface Goal extends GoalInput {
  id: string;
  amountSavedSoFar: number; // This will now be a derived value: sum of allocations.amount
  allocations: FundAllocation[]; // Detailed breakdown of where the funds are
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  status?: 'active' | 'completed' | 'on_hold';
}


// AI Financial Health Check Schemas
export const FinancialHealthCheckInputSchema = z.object({
  periodDescription: z.string().describe("Description of the period being analyzed, e.g., 'This Week (Oct 21 - Oct 27, 2023)' or 'This Month (October 2023)'."),
  currentTotalIncome: z.number().min(0).describe("Total income for the current period in INR."),
  currentTotalExpenses: z.number().min(0).describe("Total expenses for the current period in INR."),
  currentTotalInvestments: z.number().min(0).optional().describe("Total investment outflows for the current period in INR (Stocks, Mutual Funds, RD, etc.)."),
  currentSpendingBreakdown: z.string().describe("Summary of current spending by type and top categories. E.g., 'Needs: ₹15000, Wants: ₹8000, Investments: ₹5000. Top categories: Food & Dining (₹7000), Groceries: ₹4000).' Ensure INR currency symbol is used."),
  previousTotalIncome: z.number().min(0).describe("Total income for the immediately preceding period in INR."),
  previousTotalExpenses: z.number().min(0).describe("Total expenses for the immediately preceding period in INR."),
  currentCategoryTotals: z.record(z.string(), z.number()).optional().describe("Category-name → ₹ amount map for the current period."),
  previousCategoryTotals: z.record(z.string(), z.number()).optional().describe("Category-name → ₹ amount map for the previous period."),
  model: z.enum(modelNames).optional(),
});
export type FinancialHealthCheckInput = z.infer<typeof FinancialHealthCheckInputSchema>;

export const FinancialHealthCheckOutputSchema = z.object({
  healthSummary: z.string().describe("A concise (3-5 sentences) natural language summary of the user's financial activity for the period. Highlight key income/expense figures, compare to the previous period, mention spending distribution (Needs/Wants/Investments), identify and list the top 3-4 spending categories from the breakdown, provide 1-2 actionable suggestions for optimizing spending, and give a brief overall financial 'health' sentiment (eg., 'spending is well-managed', 'expenses significantly higher'). Use INR currency symbol."),
  healthScore: z.number().min(0).max(100).optional().describe("Numeric financial health score (0-100), computed from savings rate, expense growth, and budget adherence."),
  scoreBreakdown: z.object({
    savingsRate: z.number().describe("Savings rate component, 0-40."),
    expenseGrowth: z.number().describe("Expense growth penalty/bonus component, 0-30."),
    investmentRate: z.number().describe("Investment rate component, 0-30."),
  }).optional(),
  anomalies: z.array(z.object({
    label: z.string(),
    detail: z.string(),
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
  })).optional().describe("Categories or metrics that moved sharply vs the previous period."),
  model: z.enum(modelNames).optional(),
});
export type FinancialHealthCheckOutput = z.infer<typeof FinancialHealthCheckOutputSchema>;


// --- Split Expenses Feature Types ---
export type SplitMethod = 'equally' | 'custom';

export const SplitUserInputSchema = z.object({
  name: z.string().min(1, "User name is required.").max(100, "Name too long"),
});
export type SplitUserInput = z.infer<typeof SplitUserInputSchema>;

export interface SplitUser extends SplitUserInput {
  id: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export const SplitExpenseParticipantInputSchema = z.object({
  userId: z.string(),
  customShare: z.number().min(0).optional(),
});
export type SplitExpenseParticipantInput = z.infer<typeof SplitExpenseParticipantInputSchema>;

export const SplitExpenseInputSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200, "Title too long"),
  date: z.date({ description: "Date of the shared expense" }),
  totalAmount: z.number().gt(0, "Total amount must be positive."),
  paidById: z.string({ description: "ID of the SplitUser who paid the bill" }),
  splitMethod: z.enum(['equally', 'custom'], { description: "How the bill was split" }),
  participants: z.array(SplitExpenseParticipantInputSchema).min(1, "At least one participant is required for a split."),
  personalExpenseDetails: z.object({
    categoryId: z.string(),
    paymentMethodId: z.string(),
  }).optional(),
}).refine(data => {
  if (data.splitMethod === 'custom') {
    const totalCustomShares = data.participants.reduce((sum, p) => sum + (p.customShare || 0), 0);
    return Math.abs(totalCustomShares - data.totalAmount) < 0.01;
  }
  return true;
}, {
  message: "The sum of custom shares must equal the total amount.",
  path: ['participants'],
});
export type SplitExpenseInput = z.infer<typeof SplitExpenseInputSchema>;


// Raw SplitExpense for Cosmos DB storage
export interface RawSplitExpense {
  id: string;
  title: string;
  date: string; // ISO string
  totalAmount: number;
  paidById: string; // SplitUser ID (or "me")
  participants: {
    userId: string; // SplitUser ID (or "me")
    shareAmount: number;
    isSettled: boolean;
  }[];
  splitMethod: SplitMethod;
  isFullySettled: boolean; // Derived: true if all participants are settled
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// AppSplitExpense for frontend, with populated user objects
export interface AppSplitExpense extends Omit<RawSplitExpense, 'date' | 'createdAt' | 'updatedAt' | 'paidById' | 'participants'> {
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  paidBy: SplitUser; // Populated SplitUser object
  participants: {
    user: SplitUser; // Populated SplitUser object
    shareAmount: number;
    isSettled: boolean;
  }[];
}

// For calculating balances
export interface UserBalance {
  userId: string;
  userName: string;
  netAmount: number; // Positive if this user is owed, negative if this user owes overall
  owes: { toUserId: string; toUserName: string; amount: number }[];
  owedBy: { fromUserId: string; fromUserName: string; amount: number }[];
}

// AI Fixed Expense Analyzer Schemas
export const AITransactionForAnalysisSchema = z.object({
  description: z.string().nullish(),
  amount: z.number(),
  date: z.string().describe("Date in ISO format string"),
  categoryName: z.string().nullish(),
  paymentMethodName: z.string().nullish(),
  expenseType: z.enum(['need', 'want', 'investment', 'investment_expense']).nullish(),
  type: z.enum(['income', 'expense']).nullish().describe("Whether the transaction is income or expense."),
  source: z.string().nullish().describe("Source of income, when type is 'income'."),
});
export type AITransactionForAnalysis = z.infer<typeof AITransactionForAnalysisSchema>;

export const FixedExpenseAnalyzerInputSchema = z.object({
  transactions: z.array(AITransactionForAnalysisSchema).describe("An array of financial transactions for a specific month."),
  monthName: z.string().describe("The name of the month being analyzed (e.g., 'January')."),
  year: z.number().describe("The year being analyzed (e.g., 2024)."),
  model: z.enum(modelNames).optional(),
});
export type FixedExpenseAnalyzerInput = z.infer<typeof FixedExpenseAnalyzerInputSchema>;

const IdentifiedFixedExpenseSchema = z.object({
  description: z.string().describe("The common description of the recurring expense (e.g., 'Netflix Subscription', 'Rent Payment')."),
  category: z.string().describe("The category of the fixed expense (e.g., 'Subscriptions', 'Rent')."),
  estimatedAmount: z.number().describe("The estimated monthly amount for this fixed expense in INR."),
  confidence: z.enum(['High', 'Medium', 'Low']).describe("The AI's confidence that this is a true fixed/recurring expense."),
  reasoning: z.string().describe("A brief explanation for why this was identified as a fixed expense (e.g., 'Similar amount and description across months', 'Name indicates a subscription')."),
  paymentMethodName: z.string().optional().describe("The payment method used."),
  paymentMethodId: z.string().optional().describe("The ID of the payment method used."),
  expenseType: z.enum(['need', 'want', 'investment', 'investment_expense']).optional().describe("The type of expense."),
});
export type IdentifiedFixedExpense = z.infer<typeof IdentifiedFixedExpenseSchema>;

export const FixedExpenseAnalyzerOutputSchema = z.object({
  identifiedExpenses: z.array(IdentifiedFixedExpenseSchema).describe("A list of all identified fixed/recurring expenses for the month."),
  totalFixedExpenses: z.number().describe("The sum total of all identified fixed expenses in INR."),
  summary: z.string().describe("A brief summary of the findings, mentioning the total amount and the most significant fixed expenses."),
  model: z.enum(modelNames).optional(),
});
export type FixedExpenseAnalyzerOutput = z.infer<typeof FixedExpenseAnalyzerOutputSchema>;


// Budgeting Types
export const BudgetInputSchema = z.object({
  name: z.string().min(1, "Budget name is required."),
  amount: z.number().gt(0, "Amount must be a positive number."),
  type: z.enum(['category', 'expenseType']),
  targetId: z.string().min(1, "A target (category or expense type) is required."),
});
export type BudgetInput = z.infer<typeof BudgetInputSchema>;

export interface Budget extends BudgetInput {
  id: string;
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
}


// --- Opportunity Cost Analyzer Types ---
export const OpportunityCostInputSchema = z.object({
  itemName: z.string().describe("The name of the item the user wants to buy."),
  itemCost: z.number().min(1).describe("The cost of the item in INR."),
  userIncome: z.number().min(1).describe("The user's monthly income in INR."),
  workingHoursPerDay: z.number().min(1).max(24).default(8).describe("The number of hours the user works per day."),
  workingDaysPerMonth: z.number().min(1).max(31).default(22).describe("The number of days the user works per month."),
  annualReturnRate: z.number().min(0).max(50).default(10).describe("Assumed annual return rate (%) for the investment alternative calculation."),
  investmentYears: z.number().min(1).max(40).default(10).describe("Investment horizon (years) for the future-value calculation."),
  model: z.enum(modelNames).optional(),
});
export type OpportunityCostInput = z.infer<typeof OpportunityCostInputSchema>;

export const OpportunityCostOutputSchema = z.object({
  timeCost: z.string().describe("A human-readable string representing the cost in terms of work time (e.g., 'approx. 2.5 days of work', 'about 6 hours of work')."),
  investmentAlternative: z.string().describe("A sentence describing the potential future value if the money were invested instead. E.g., 'If invested, this amount could grow to approximately ₹X in 10 years at a 10% annual return.'"),
  alternativeUses: z.array(z.string()).describe("A list of 3-4 alternative, productive, or enriching ways the money could be spent (e.g., 'A weekend trip to a nearby city', 'An online course on a new skill', 'A high-quality set of professional clothes')."),
  summary: z.string().describe("A concluding, thought-provoking summary to help the user make a decision."),
  model: z.enum(modelNames).optional(),
});
export type OpportunityCostOutput = z.infer<typeof OpportunityCostOutputSchema>;

export const ComparativeExpenseAnalysisInputSchema = z.object({
  currentMonth: z.string().describe('The current month for expense analysis (e.g., "January").'),
  previousMonth: z.string().describe('The previous month for expense comparison (e.g., "December").'),
  currentMonthExpenses: z.number().describe('Total expenses for the current month in INR.'),
  previousMonthExpenses: z.number().describe('Total expenses for the previous month in INR.'),
  expenseCategoriesCurrent: z.string().describe('A string representation of expense categories and amounts for the current month, e.g., "Food: ₹5000, Transport: ₹3000".'),
  expenseCategoriesPrevious: z.string().describe('A string representation of expense categories and amounts for the previous month, e.g., "Food: ₹4000, Transport: ₹2500".'),
  model: z.enum(modelNames).optional(),
});
export type ComparativeExpenseAnalysisInput = z.infer<typeof ComparativeExpenseAnalysisInputSchema>;

export const ComparativeExpenseAnalysisOutputSchema = z.object({
  analysis: z.string().describe("A concise, insightful summary comparing spending habits between the two months. Use '\\n' for new lines in a single string."),
  model: z.enum(modelNames).optional(),
});
export type ComparativeExpenseAnalysisOutput = z.infer<typeof ComparativeExpenseAnalysisOutputSchema>;

export const MonthlyFinancialReportInputSchema = z.object({
  monthName: z.string(),
  year: z.number(),
  transactions: z.array(AITransactionForAnalysisSchema),
  model: z.enum(modelNames).optional(),
});
export type MonthlyFinancialReportInput = z.infer<typeof MonthlyFinancialReportInputSchema>;
export const MonthlyFinancialReportOutputSchema = z.object({
  executiveSummary: z.string(),
  incomeVsExpenseAnalysis: z.string(),
  categoryDeepDive: z.string(),
  savingsAndInvestmentAnalysis: z.string(),
  actionableRecommendations: z.array(z.string()),
  model: z.enum(modelNames).optional(),
});
export type MonthlyFinancialReportOutput = z.infer<typeof MonthlyFinancialReportOutputSchema>;

// Yearly Financial Report
export const MonthlySummarySchema = z.object({
  monthName: z.string(),
  monthIndex: z.number(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  needs: z.number(),
  wants: z.number(),
  investments: z.number(),
  transactionCount: z.number(),
  topCategories: z.array(z.object({ name: z.string(), amount: z.number(), txnCount: z.number() })),
});
export type MonthlySummary = z.infer<typeof MonthlySummarySchema>;

export const YearlyFinancialReportInputSchema = z.object({
  year: z.number(),
  monthlySummaries: z.array(MonthlySummarySchema),
  transactions: z.array(AITransactionForAnalysisSchema).optional().describe("Full year transactions when small enough; omitted when large."),
  largestTransactions: z.array(AITransactionForAnalysisSchema).optional().describe("Top largest transactions of the year, used when full set is too large."),
  totalTransactionCount: z.number(),
  isAggregated: z.boolean().describe("True when the AI is being given aggregates + sample due to large data."),
  model: z.enum(modelNames).optional(),
});
export type YearlyFinancialReportInput = z.infer<typeof YearlyFinancialReportInputSchema>;

export const YearlyFinancialReportOutputSchema = z.object({
  executiveSummary: z.string(),
  incomeVsExpenseAnalysis: z.string(),
  categoryDeepDive: z.string(),
  savingsAndInvestmentAnalysis: z.string(),
  actionableRecommendations: z.array(z.string()),
  model: z.enum(modelNames).optional(),
});
export type YearlyFinancialReportOutput = z.infer<typeof YearlyFinancialReportOutputSchema>;

// Spending Insights
export const SpendingInsightsOutputSchema = z.object({
  insights: z.string().describe("A string containing 4-6 numbered insights, separated by \\n."),
  model: z.enum(modelNames).optional(),
});
export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;
