'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { AIModel, ComparativeExpenseAnalysisInputSchema, ComparativeExpenseAnalysisOutputSchema } from '@/lib/types';
import { callStructuredLLM } from '@/lib/ai-client';
import { getDefaultModelForTask } from '@/lib/task-models';

export type ComparativeExpenseAnalysisInput = z.infer<typeof ComparativeExpenseAnalysisInputSchema>;
export type ComparativeExpenseAnalysisOutput = z.infer<typeof ComparativeExpenseAnalysisOutputSchema>;


export async function comparativeExpenseAnalysis(
  input: ComparativeExpenseAnalysisInput
): Promise<ComparativeExpenseAnalysisOutput> {
  const modelToUse = input.model || getDefaultModelForTask('comparative_analysis');
  const result = await comparativeExpenseAnalysisFlow(input);
  return { ...result, model: modelToUse };
}

const universalPromptTemplate = `You are a personal finance advisor. Analyze the user's spending habits in Indian Rupees (INR) between the current and previous months and provide insights on their spending trends, potential areas of savings, and any significant changes in spending patterns.

Your response MUST be a valid JSON object.

Current Period: {{currentMonth}}
Previous Period: {{previousMonth}}
Current Period Expenses: ₹{{currentMonthExpenses}}
Previous Period Expenses: ₹{{previousMonthExpenses}}
Expense Categories Current: {{expenseCategoriesCurrent}}
Expense Categories Previous: {{expenseCategoriesPrevious}}

Provide a detailed comparative analysis. Focus on identifying specific categories where spending has increased or decreased significantly. Offer suggestions for potential savings or areas where the user could adjust their spending habits.
`;

const comparativeExpenseAnalysisFlow = ai.defineFlow(
  {
    name: 'comparativeExpenseAnalysisFlow',
    inputSchema: ComparativeExpenseAnalysisInputSchema,
    outputSchema: ComparativeExpenseAnalysisOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = (input as any).model || getDefaultModelForTask('comparative_analysis');
    let output = await callStructuredLLM(model, universalPromptTemplate, input, ComparativeExpenseAnalysisOutputSchema.omit({ model: true }));

    if (!output) {
      throw new Error("AI analysis failed to produce a valid output structure.");
    }
    return output;
  }
);

