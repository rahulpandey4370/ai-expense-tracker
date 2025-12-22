
'use server';
/**
 * @fileOverview AI flow for analyzing and identifying fixed/recurring monthly expenses.
 *
 * - analyzeFixedExpenses - A function that uses AI to find fixed expenses from transactions.
 * - FixedExpenseAnalyzerInput - The input type for the function.
 * - FixedExpenseAnalyzerOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { 
    FixedExpenseAnalyzerInputSchema, 
    FixedExpenseAnalyzerOutputSchema, 
    type FixedExpenseAnalyzerInput, 
    type FixedExpenseAnalyzerOutput,
    type AIModel
} from '@/lib/types';

const FixedExpenseAnalyzerInputSchemaInternal = FixedExpenseAnalyzerInputSchema.extend({
    model: z.string().optional(),
});

export async function analyzeFixedExpenses(
  input: FixedExpenseAnalyzerInput & { model?: AIModel }
): Promise<FixedExpenseAnalyzerOutput> {
  try {
    const validatedInput = FixedExpenseAnalyzerInputSchemaInternal.parse(input);
    if (validatedInput.transactions.length === 0) {
      return {
        identifiedExpenses: [],
        totalFixedExpenses: 0,
        summary: `No transactions were provided for ${input.monthName} ${input.year}, so no analysis could be performed.`,
      };
    }
    return await fixedExpenseAnalyzerFlow(validatedInput);
  } catch (flowError: any) {
    console.error("Error executing fixedExpenseAnalyzerFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    if (flowError instanceof z.ZodError) {
      return {
        identifiedExpenses: [],
        totalFixedExpenses: 0,
        summary: `Could not perform analysis due to invalid input: ${JSON.stringify(flowError.flatten().fieldErrors)}.`,
      };
    }
    return {
      identifiedExpenses: [],
      totalFixedExpenses: 0,
      summary: `An unexpected error occurred while analyzing fixed expenses: ${errorMessage}`,
    };
  }
}

const fixedExpensePrompt = ai().definePrompt({
  name: 'fixedExpenseAnalyzerPrompt',
  input: { schema: FixedExpenseAnalyzerInputSchemaInternal.omit({ model: true }) },
  output: { schema: FixedExpenseAnalyzerOutputSchema },
  config: {
    temperature: 0.2, // Low temperature for factual analysis
    maxOutputTokens: 1000,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `You are an expert financial analyst for FinWise AI. Your task is to identify fixed, recurring monthly expenses from a list of transactions for a specific month.
Fixed expenses are payments that are the same, or very similar, each month. Examples include rent, loan EMIs, subscriptions (Netflix, Spotify), insurance premiums, and utility bills. Some expenses like 'Groceries' or 'Auto & Transportation' (petrol) can also be considered fixed if they show a consistent, recurring pattern.

**CRITICAL RULE: DO NOT include investments in this analysis.** Exclude any transactions related to Stocks, Mutual Funds, Bonds, Recurring Deposits, or any other form of financial investment. Fixed expenses are for living costs (goods and services), not wealth-building.

Analyze the provided transactions for {{monthName}} {{year}}.

Transaction Data:
\`\`\`json
{{#each transactions}}
- {{this.description}} ({{this.categoryName}}): ₹{{this.amount}} on {{this.date}}
{{/each}}
\`\`\`

Your Task:
1.  **Identify Fixed Expenses**: Scrutinize transaction descriptions and categories.
    - **High Priority Keywords**: "Rent", "EMI", "Subscription", "Insurance", "Premium", "Salary" (for maid/driver).
    - **Medium Priority Keywords**: "Bill" (for utilities), "Fee".
    - **Analyze Patterns for Variable Costs**: For categories like "Groceries" and "Auto & Transportation" (petrol), if there are multiple transactions that suggest a regular, essential pattern (e.g., weekly grocery shopping, daily commute costs), consider them as a combined fixed expense. Sum up these recurring costs for the month to estimate the total fixed expense for that category.
2.  **Estimate Monthly Amount**: For each identified fixed expense, use the amount from the transaction. If multiple transactions make up a single recurring cost (like several grocery trips), sum them up to create a single entry for that category (e.g., 'Groceries').
3.  **Assess Confidence**: For each identified expense, assess your confidence ('High', 'Medium', 'Low').
    - 'High': Clear keywords like "Rent", "EMI", "Subscription".
    - 'Medium': Keywords like "Bill", "Premium", or strong recurring patterns in categories like Groceries or Transportation.
    - 'Low': Based on merchant name that is often a subscription but not explicitly stated (e.g., 'Google', 'Amazon Prime') or less frequent patterns.
4.  **Provide Reasoning**: Briefly explain your reasoning. For pattern-based expenses like groceries, state "Identified a recurring pattern of essential purchases."
5.  **Calculate Total**: Sum up the estimated amounts of all identified fixed expenses.
6.  **Summarize Findings**: Write a brief summary of your analysis.

IMPORTANT:
- Do NOT include discretionary one-off purchases like "Dinner at a fancy restaurant", "Movie tickets", or "Clothing shopping" unless there is very strong evidence of a recurring subscription (e.g., "Clothing Box Subscription").
- Again, **explicitly exclude all investment-related transactions.**
- Structure your output precisely according to the defined JSON schema.
- If no fixed expenses can be identified, return an empty 'identifiedExpenses' array and a summary stating that.
`,
});

const fixedExpenseAnalyzerFlow = ai().defineFlow(
  {
    name: 'fixedExpenseAnalyzerFlow',
    inputSchema: FixedExpenseAnalyzerInputSchemaInternal,
    outputSchema: FixedExpenseAnalyzerOutputSchema,
  },
  async (input) => {
    const llm = ai(input.model as AIModel);
    const configuredPrompt = llm.definePrompt(fixedExpensePrompt.getDefinition());
    const result = await retryableAIGeneration(() => configuredPrompt(input));
    return result.output!;
  }
);
