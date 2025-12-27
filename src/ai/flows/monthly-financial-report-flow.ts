
'use server';
<<<<<<< HEAD
/**
 * @fileOverview AI flow for generating an in-depth monthly financial report.
 *
 * This flow takes a comprehensive look at a user's financial data for a specific month,
 * compares it with the previous month, and generates a verbose, structured report.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { 
    MonthlyFinancialReportInputSchema, 
    MonthlyFinancialReportOutputSchema,
    type MonthlyFinancialReportInput,
    type MonthlyFinancialReportOutput,
    type AITransactionForAnalysis
} from '@/lib/types';


const reportPrompt = ai().definePrompt({
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

const monthlyFinancialReportFlow = ai().defineFlow(
  {
    name: 'monthlyFinancialReportFlow',
    inputSchema: MonthlyFinancialReportInputSchema,
    outputSchema: MonthlyFinancialReportOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const modelToUse = 'gemini-2.5-flash';
    const llm = ai(modelToUse);
    
    // We create a temporary prompt instance with the selected LLM
    const configuredPrompt = llm.definePrompt(reportPrompt.getDefinition());

    const { output } = await retryableAIGeneration(() => configuredPrompt(input));

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
=======
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '../utils/retry-helper';
import { MonthlyFinancialReportInputSchema, MonthlyFinancialReportOutputSchema } from '@/lib/types';
import type { MonthlyFinancialReportInput, MonthlyFinancialReportOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';

export async function generateMonthlyFinancialReport(input: MonthlyFinancialReportInput): Promise<MonthlyFinancialReportOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  try {
    const result = await monthlyFinancialReportFlow(input, { model: modelToUse });
    return { ...result, model: modelToUse };
  } catch (error: any) {
    console.error(`Error in generateMonthlyFinancialReport flow: ${error.message}`, error.stack);
    throw new Error(`An unexpected error occurred while generating the financial report: ${error.message}`);
  }
}

const reportPrompt = ai.definePrompt({
  name: 'monthlyFinancialReportPrompt',
  input: { schema: MonthlyFinancialReportInputSchema.omit({ model: true }) },
  output: { schema: MonthlyFinancialReportOutputSchema.omit({ model: true }) },
  prompt: `You are an expert financial analyst. Your task is to create a detailed monthly financial report in markdown format based on the user's transaction data for {{monthName}} {{year}}.

Transaction Data:
\`\`\`json
{{{json transactions}}}
\`\`\`

**Report Sections:**

**1. Executive Summary:**
   - Start with a brief, high-level overview of the month's financial health.
   - Mention total income, total expenses, and net savings/loss.
   - Highlight one key positive and one area for improvement.

**2. Income vs. Expense Analysis:**
   - Detail the total income and total expenses.
   - Calculate and state the savings rate for the month ((Income - Expenses) / Income).
   - Compare this month's spending to the previous month if data is available, or note if it's not.

**3. Category Deep-Dive:**
   - Identify the top 3-5 spending categories.
   - For each top category, provide the total amount spent and the percentage of total expenses it represents.
   - Offer a brief insight for at least one of the top categories (e.g., "Food and Dining was the highest expense, consider tracking sub-categories like 'groceries' vs 'eating out'.").

**4. Savings and Investment Analysis:**
   - Identify and sum up all transactions categorized under investment-related categories (e.g., 'Stocks', 'Mutual Funds').
   - Calculate the investment rate ((Total Investment / Total Income)).
   - Analyze the net cash flow (Income - all outflows) and what it implies for their savings goals.

**5. Actionable Recommendations:**
   - Provide 2-3 clear, actionable recommendations.
   - Examples: "Set a budget of ₹X for 'Shopping' next month.", "Consider automating a small monthly investment of ₹Y.", "Review your subscriptions to find potential savings."

**Formatting Rules:**
- Use markdown for clear, readable sections.
- Use bolding for key terms and figures.
- Use bullet points for lists.
- All monetary values must be in Indian Rupees (₹).
`,
});


const monthlyFinancialReportFlow = ai.defineFlow(
  {
    name: 'monthlyFinancialReportFlow',
    inputSchema: MonthlyFinancialReportInputSchema.omit({ model: true }),
    outputSchema: MonthlyFinancialReportOutputSchema.omit({ model: true }),
  },
  async (input, options) => {
    const model = options?.model;
    
    // Create the prompt input, excluding the model property
    const promptInput = {
      monthName: input.monthName,
      year: input.year,
      transactions: input.transactions,
    };
    
    const { output } = await retryableAIGeneration(() => reportPrompt(promptInput, { model: model ? googleAI.model(model as string) : undefined }));
    if (!output) {
      throw new Error("Financial report generation failed to produce an output.");
    }
    return output;
  }
);
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
