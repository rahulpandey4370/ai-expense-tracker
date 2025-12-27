'use server';
/**
 * @fileOverview AI flow for generating an in-depth monthly financial report.
 *
 * This flow takes a comprehensive look at a user's financial data for a specific month,
 * compares it with the previous month, and generates a verbose, structured report.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import type { AIModel } from '@/contexts/AIModelContext';
import type { AITransactionForAnalysis } from '@/lib/types';


export const MonthlyFinancialReportInputSchema = z.object({
  monthName: z.string().describe("The name of the month being analyzed (e.g., 'January')."),
  year: z.number().describe("The year being analyzed (e.g., 2024)."),
  currentMonthTransactions: z.array(z.custom<AITransactionForAnalysis>()).describe("An array of all transactions for the current month."),
  previousMonthTransactions: z.array(z.custom<AITransactionForAnalysis>()).describe("An array of all transactions for the previous month, for comparison."),
  model: z.string().optional().describe("The AI model to use for generation."),
});
export type MonthlyFinancialReportInput = z.infer<typeof MonthlyFinancialReportInputSchema>;


export const MonthlyFinancialReportOutputSchema = z.object({
  reportTitle: z.string().describe("A suitable title for the report, e.g., 'Financial Report for January 2024'."),
  overallSummary: z.string().describe("A 2-3 sentence high-level summary of the month's financial health, mentioning income, spending, and savings."),
  incomeAnalysis: z.object({
    totalIncome: z.number().describe("Total income for the month in INR."),
    incomeSources: z.array(z.object({ source: z.string(), amount: z.number() })).describe("A breakdown of income by source/category."),
    comparison: z.string().describe("A brief comparison of this month's income to the last."),
  }),
  spendingAnalysis: z.object({
    totalSpending: z.number().describe("Total spending for the month in INR."),
    comparison: z.string().describe("A brief comparison of this month's spending to the last."),
    categoryBreakdown: z.array(z.object({
      category: z.string(),
      amount: z.number(),
      percentage: z.number().describe("Percentage of total spending."),
      insight: z.string().optional().describe("A brief insight into this category's spending."),
    })).describe("A detailed breakdown of spending by the top 5-7 categories."),
    notableTransactions: z.array(z.object({
        description: z.string(),
        amount: z.number(),
        date: z.string(),
        reason: z.string().describe("Why this transaction is considered notable (e.g., 'Largest purchase', 'Unusual category')."),
    })).optional().describe("A list of 2-3 particularly large, unusual, or interesting transactions."),
  }),
  savingsAndInvestmentAnalysis: z.object({
    totalSavings: z.number().describe("Net savings for the month (Income - Expenses) in INR."),
    savingsRate: z.number().describe("Savings rate as a percentage of income."),
    totalInvestments: z.number().describe("Total amount actively invested this month."),
    investmentRate: z.number().describe("Investment rate as a percentage of income."),
    summary: z.string().describe("A summary of savings and investment performance."),
  }),
  actionableInsights: z.array(z.string()).describe("A list of 3-5 concrete, actionable tips for the user based on the analysis (e.g., 'Consider setting a budget for 'Food and Dining'', 'Your savings rate is strong, consider automating investments.')."),
  model: z.string().optional().describe("The AI model that generated this report."),
});
export type MonthlyFinancialReportOutput = z.infer<typeof MonthlyFinancialReportOutputSchema>;


const reportPrompt = ai.definePrompt({
  name: 'monthlyFinancialReportPrompt',
  input: { schema: MonthlyFinancialReportInputSchema.omit({ model: true }) },
  output: { schema: MonthlyFinancialReportOutputSchema.omit({ model: true }) },
  prompt: `You are an expert financial analyst named 'Fin'. Your task is to generate a comprehensive, insightful, and easy-to-read monthly financial report for a user of the FinWise AI app. Use the provided transaction data in Indian Rupees (INR).

**User's Data:**
- **Report for:** {{monthName}} {{year}}
- **Current Month's Transactions:**
\`\`\`json
{{{json currentMonthTransactions}}}
\`\`\`
- **Previous Month's Transactions:**
\`\`\`json
{{{json previousMonthTransactions}}}
\`\`\`

**Your Report Must Include:**
1.  **Report Title**: A clear title like "Financial Report for {{monthName}} {{year}}".
2.  **Overall Summary**: A concise, 2-3 sentence executive summary of the month.
3.  **Income Analysis**:
    - Calculate total income.
    - List the main sources of income and their amounts.
    - Compare total income to the previous month.
4.  **Spending Analysis**:
    - Calculate total spending.
    - Compare total spending to the previous month.
    - Provide a detailed breakdown of the top 5-7 spending categories, including amount, percentage of total spend, and a brief insight for each (e.g., "Food and Dining was your highest expense at 25%, slightly up from last month.").
    - Identify 2-3 'notable transactions' that are unusually large, frequent, or in a rare category, and explain why they are notable.
5.  **Savings & Investment Analysis**:
    - Calculate Net Savings (Total Income - Total Spending).
    - Calculate the Savings Rate (Net Savings / Total Income).
    - Calculate the total amount invested (from transactions marked as 'investment' expense type).
    - Calculate the Investment Rate (Total Investments / Total Income).
    - Write a brief summary of their savings and investment activity.
6.  **Actionable Insights**: Provide a bulleted list of 3-5 clear, concrete, and actionable recommendations. These should be personalized based on the user's data. Examples: "Your 'Subscriptions' spending has increased; consider reviewing for any you no longer use." or "You have a high savings rate this month; consider allocating a portion to your financial goals."

**Formatting and Tone:**
- Be professional, encouraging, and insightful. Avoid being judgmental.
- Use the Rupee symbol (₹) for all amounts.
- Ensure all calculations are accurate.
- Structure your output precisely according to the JSON schema.
`,
});

const monthlyFinancialReportFlow = ai.defineFlow(
  {
    name: 'monthlyFinancialReportFlow',
    inputSchema: MonthlyFinancialReportInputSchema,
    outputSchema: MonthlyFinancialReportOutputSchema,
  },
  async (input) => {
    const modelToUse = input.model || 'gemini-2.5-flash';
    
    const { output } = await retryableAIGeneration(() => reportPrompt(input));

    if (!output) {
      throw new Error("AI failed to generate a valid report structure.");
    }

    return {
        ...output,
        model: modelToUse,
    };
  }
);


export async function generateMonthlyFinancialReport(input: MonthlyFinancialReportInput): Promise<MonthlyFinancialReportOutput> {
  try {
    const validatedInput = MonthlyFinancialReportInputSchema.parse(input);
    return await monthlyFinancialReportFlow(validatedInput);
  } catch (error: any) {
     if (error instanceof z.ZodError) {
      console.error("Zod validation error in generateMonthlyFinancialReport wrapper:", error.flatten());
      throw new Error(`Invalid input for AI report: ${JSON.stringify(error.flatten().fieldErrors)}`);
    }
    console.error("Error executing monthlyFinancialReportFlow in wrapper:", error);
    throw new Error(`An unexpected error occurred while generating the financial report: ${error.message}`);
  }
}
