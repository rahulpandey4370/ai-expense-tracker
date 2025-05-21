
'use server';
/**
 * @fileOverview AI flow for generating a weekly/monthly financial health check summary.
 *
 * - getFinancialHealthCheck - A function that uses AI to summarize financial activity.
 * - FinancialHealthCheckInput - The input type for the getFinancialHealthCheck function.
 * - FinancialHealthCheckOutput - The return type for the getFinancialHealthCheck function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import type { FinancialHealthCheckInput, FinancialHealthCheckOutput } from '@/lib/types';

// Internal Zod schemas - not exported from this 'use server' file
const FinancialHealthCheckInputSchemaInternal = z.object({
  periodDescription: z.string().describe("Description of the period being analyzed, e.g., 'This Week (Oct 21 - Oct 27, 2023)' or 'This Month (October 2023)'."),
  currentTotalIncome: z.number().min(0).describe("Total income for the current period in INR."),
  currentTotalExpenses: z.number().min(0).describe("Total expenses for the current period in INR."),
  currentSpendingBreakdown: z.string().describe("Summary of current spending by type and top categories. E.g., 'Needs: ₹15000, Wants: ₹8000, Investments_Expenses: ₹5000. Top categories: Food & Dining (₹7000), Groceries (₹4000).' Ensure INR currency symbol is used."),
  previousTotalIncome: z.number().min(0).describe("Total income for the immediately preceding period in INR."),
  previousTotalExpenses: z.number().min(0).describe("Total expenses for the immediately preceding period in INR."),
});

const FinancialHealthCheckOutputSchemaInternal = z.object({
  healthSummary: z.string().describe("A concise (3-5 sentences) natural language summary of the user's financial activity for the period. Highlight key income/expense figures, compare to the previous period, mention spending distribution (Needs/Wants/Investments), identify and list the top 3-4 spending categories from the breakdown, provide 1-2 actionable suggestions for optimizing spending, and give a brief overall financial 'health' sentiment (e.g., 'spending is well-managed', 'expenses significantly higher'). Use INR currency symbol."),
});

export async function getFinancialHealthCheck(
  input: FinancialHealthCheckInput
): Promise<FinancialHealthCheckOutput> {
  try {
    const validatedInput = FinancialHealthCheckInputSchemaInternal.parse(input);
    return await financialHealthCheckFlow(validatedInput);
  } catch (flowError: any) {
    console.error("Error executing financialHealthCheckFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    if (flowError instanceof z.ZodError) {
      return {
        healthSummary: `Could not generate health check due to input errors: ${JSON.stringify(flowError.flatten().fieldErrors)}. Please check server logs.`
      };
    }
    return {
      healthSummary: `An unexpected error occurred while generating the health check: ${errorMessage}`
    };
  }
}

const healthCheckPrompt = ai.definePrompt({
  name: 'financialHealthCheckPrompt',
  input: { schema: FinancialHealthCheckInputSchemaInternal },
  output: { schema: FinancialHealthCheckOutputSchemaInternal },
  config: {
    temperature: 0.4,
    maxOutputTokens: 400, // Increased slightly for more detail
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `You are a friendly financial assistant for FinWise AI.
Provide a concise (3-5 sentences) financial health check summary for the user based on the provided data in Indian Rupees (INR).

Period: {{periodDescription}}

Current Period Data:
- Total Income: ₹{{currentTotalIncome}}
- Total Expenses: ₹{{currentTotalExpenses}}
- Spending Breakdown: {{currentSpendingBreakdown}}

Previous Period Data (for comparison):
- Total Income: ₹{{previousTotalIncome}}
- Total Expenses: ₹{{previousTotalExpenses}}

Your Task:
1.  Briefly state the total income and expenses for the current period.
2.  Compare these figures to the previous period (e.g., "Income increased by ₹X", "Spending was ₹Y lower").
3.  Comment on the current spending breakdown (e.g., "Most spending was on Needs.").
4.  Identify and list the top 3-4 spending categories from the 'currentSpendingBreakdown' field.
5.  Provide 1-2 specific, actionable suggestions for optimizing spending, potentially focusing on the identified top categories or general saving tips.
6.  Give a brief overall sentiment about their financial health for this period (e.g., "Overall, spending seems well-managed this period.", "Expenses were notably high compared to income.").
7.  Be positive and constructive. Use the ₹ symbol for INR amounts.
`,
});

const financialHealthCheckFlow = ai.defineFlow(
  {
    name: 'financialHealthCheckFlow',
    inputSchema: FinancialHealthCheckInputSchemaInternal,
    outputSchema: FinancialHealthCheckOutputSchemaInternal,
  },
  async (input) => {
    const result = await retryableAIGeneration(() => healthCheckPrompt(input));
    return result.output!;
  }
);

