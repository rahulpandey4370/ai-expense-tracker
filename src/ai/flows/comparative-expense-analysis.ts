
'use server';

/**
 * @fileOverview This file is deprecated. The functionality has been replaced by the more comprehensive monthly-financial-report-flow.
 */

import {ai} from '@/ai/genkit';
import {z}from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import type { AIModel } from '@/lib/types';

const ComparativeExpenseAnalysisInputSchema = z.object({
  currentMonth: z.string().describe('The current month for expense analysis (e.g., "January").'),
  previousMonth: z.string().describe('The previous month for expense comparison (e.g., "December").'),
  currentMonthExpenses: z.number().describe('Total expenses for the current month in INR.'),
  previousMonthExpenses: z.number().describe('Total expenses for the previous month in INR.'),
  expenseCategoriesCurrent: z.string().describe('A string representation of expense categories and amounts for the current month, e.g., "Food: ₹5000, Transport: ₹3000".'),
  expenseCategoriesPrevious: z.string().describe('A string representation of expense categories and amounts for the previous month, e.g., "Food: ₹4000, Transport: ₹2500".'),
  model: z.string().optional(),
});
export type ComparativeExpenseAnalysisInput = z.infer<typeof ComparativeExpenseAnalysisInputSchema>;

const ComparativeExpenseAnalysisOutputSchema = z.object({
  analysis: z.string(),
});
export type ComparativeExpenseAnalysisOutput = z.infer<typeof ComparativeExpenseAnalysisOutputSchema>;

export async function comparativeExpenseAnalysis(
  input: ComparativeExpenseAnalysisInput
): Promise<ComparativeExpenseAnalysisOutput> {
  return comparativeExpenseAnalysisFlow(input);
}

const prompt = ai().definePrompt({
  name: 'comparativeExpenseAnalysisPrompt',
  input: {schema: ComparativeExpenseAnalysisInputSchema.omit({ model: true })},
  output: {schema: ComparativeExpenseAnalysisOutputSchema},
  prompt: `You are a personal finance advisor. Analyze the user's spending habits in Indian Rupees (INR) between the current and previous months and provide insights on their spending trends, potential areas of savings, and any significant changes in spending patterns.

Your response MUST be a valid JSON object.

Current Period: {{currentMonth}}
Previous Period: {{previousMonth}}
Current Period Expenses: ₹{{currentMonthExpenses}}
Previous Period Expenses: ₹{{previousMonthExpenses}}
Current Period Expense Categories: {{expenseCategoriesCurrent}}
Previous Period Expense Categories: {{expenseCategoriesPrevious}}

Provide a detailed comparative analysis. Focus on identifying specific categories where spending has increased or decreased significantly. Offer suggestions for potential savings or areas where the user could adjust their spending habits.
`,
});

const comparativeExpenseAnalysisFlow = ai().defineFlow(
  {
    name: 'comparativeExpenseAnalysisFlow',
    inputSchema: ComparativeExpenseAnalysisInputSchema,
    outputSchema: ComparativeExpenseAnalysisOutputSchema,
  },
  async input => {
    const llm = ai(input.model as AIModel);
    const configuredPrompt = llm.definePrompt(prompt.getDefinition());
    const {output} = await retryableAIGeneration(() => configuredPrompt(input));
    return output!;
  }
);
