'use server';

/**
 * @fileOverview Provides comparative analysis of expenses between different months using Gemini-2.0-flash.
 *
 * - comparativeExpenseAnalysis - A function that handles the comparative expense analysis process.
 * - ComparativeExpenseAnalysisInput - The input type for the comparativeExpenseAnalysis function.
 * - ComparativeExpenseAnalysisOutput - The return type for the comparativeExpenseAnalysis function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ComparativeExpenseAnalysisInputSchema = z.object({
  currentMonth: z.string().describe('The current month for expense analysis (e.g., "January").'),
  previousMonth: z.string().describe('The previous month for expense comparison (e.g., "December").'),
  currentMonthExpenses: z.number().describe('Total expenses for the current month.'),
  previousMonthExpenses: z.number().describe('Total expenses for the previous month.'),
  expenseCategoriesCurrent: z.string().describe('A string representation of expense categories and amounts for the current month, e.g., \"Food: $500, Transport: $300\".'),
  expenseCategoriesPrevious: z.string().describe('A string representation of expense categories and amounts for the previous month, e.g., \"Food: $400, Transport: $250\".'),
});
export type ComparativeExpenseAnalysisInput = z.infer<typeof ComparativeExpenseAnalysisInputSchema>;

const ComparativeExpenseAnalysisOutputSchema = z.object({
  analysis: z.string().describe('A detailed comparative analysis of expenses between the current and previous months, including trends and potential savings areas.'),
});
export type ComparativeExpenseAnalysisOutput = z.infer<typeof ComparativeExpenseAnalysisOutputSchema>;

export async function comparativeExpenseAnalysis(
  input: ComparativeExpenseAnalysisInput
): Promise<ComparativeExpenseAnalysisOutput> {
  return comparativeExpenseAnalysisFlow(input);
}

const prompt = ai.definePrompt({
  name: 'comparativeExpenseAnalysisPrompt',
  input: {schema: ComparativeExpenseAnalysisInputSchema},
  output: {schema: ComparativeExpenseAnalysisOutputSchema},
  prompt: `You are a personal finance advisor. Analyze the user's spending habits between the current and previous months and provide insights on their spending trends, potential areas of savings, and any significant changes in spending patterns.

Current Month: {{currentMonth}}
Previous Month: {{previousMonth}}
Current Month Expenses: ${{currentMonthExpenses}}
Previous Month Expenses: ${{previousMonthExpenses}}
Current Month Expense Categories: {{expenseCategoriesCurrent}}
Previous Month Expense Categories: {{expenseCategoriesPrevious}}

Provide a detailed comparative analysis. Focus on identifying specific categories where spending has increased or decreased significantly. Offer suggestions for potential savings or areas where the user could adjust their spending habits.
`, // Changed the system prompt to a more direct instruction
});

const comparativeExpenseAnalysisFlow = ai.defineFlow(
  {
    name: 'comparativeExpenseAnalysisFlow',
    inputSchema: ComparativeExpenseAnalysisInputSchema,
    outputSchema: ComparativeExpenseAnalysisOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
