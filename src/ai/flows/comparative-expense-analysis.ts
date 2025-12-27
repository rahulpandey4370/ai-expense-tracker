
'use server';

/**
 * @fileOverview This file is deprecated. The functionality has been replaced by the more comprehensive monthly-financial-report-flow.
 */

<<<<<<< HEAD
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
=======
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { AIModel, ComparativeExpenseAnalysisInputSchema, ComparativeExpenseAnalysisOutputSchema } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';


>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
export type ComparativeExpenseAnalysisInput = z.infer<typeof ComparativeExpenseAnalysisInputSchema>;
<<<<<<< HEAD

const ComparativeExpenseAnalysisOutputSchema = z.object({
  analysis: z.string(),
});
=======
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
export type ComparativeExpenseAnalysisOutput = z.infer<typeof ComparativeExpenseAnalysisOutputSchema>;


export async function comparativeExpenseAnalysis(
  input: ComparativeExpenseAnalysisInput
): Promise<ComparativeExpenseAnalysisOutput> {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  const modelToUse = input.model || 'gemini-3-flash-preview';
  const result = await comparativeExpenseAnalysisFlow(input);
  return { ...result, model: modelToUse };
}

const prompt = ai().definePrompt({
  name: 'comparativeExpenseAnalysisPrompt',
  input: {schema: ComparativeExpenseAnalysisInputSchema.omit({ model: true })},
  output: {schema: ComparativeExpenseAnalysisOutputSchema},
=======
  // We can't directly pass the full input to the flow if the flow's internal schema is different.
  // The flow expects the raw input, and it will derive the model from it.
  return comparativeExpenseAnalysisFlow(input);
=======
  const modelToUse = input.model || 'gemini-1.5-flash-latest';
=======
  const modelToUse = input.model || 'gemini-3-flash-preview';
>>>>>>> 999104a (So it works for chat but not for insights or the AI transaction parsing)
  const result = await comparativeExpenseAnalysisFlow(input, { model: modelToUse });
  return { ...result, model: modelToUse };
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
}


const prompt = ai.definePrompt({
  name: 'comparativeExpenseAnalysisPrompt',
  // The input schema for the prompt itself doesn't need the model
  input: { schema: ComparativeExpenseAnalysisInputSchema.omit({ model: true }) },
<<<<<<< HEAD
  output: { schema: ComparativeExpenseAnalysisOutputSchema },
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
=======
  output: { schema: ComparativeExpenseAnalysisOutputSchema.omit({ model: true }) },
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
  prompt: `You are a personal finance advisor. Analyze the user's spending habits in Indian Rupees (INR) between the current and previous months and provide insights on their spending trends, potential areas of savings, and any significant changes in spending patterns.

Your response MUST be a valid JSON object.

Your response MUST be a valid JSON object.

Current Period: {{currentMonth}}
Previous Period: {{previousMonth}}
Current Period Expenses: ₹{{currentMonthExpenses}}
Previous Period Expenses: ₹{{previousMonthExpenses}}
Expense Categories Current: {{expenseCategoriesCurrent}}
Expense Categories Previous: {{expenseCategoriesPrevious}}

Provide a detailed comparative analysis. Focus on identifying specific categories where spending has increased or decreased significantly. Offer suggestions for potential savings or areas where the user could adjust their spending habits.
`;

const comparativeExpenseAnalysisFlow = ai().defineFlow(
  {
    name: 'comparativeExpenseAnalysisFlow',
    inputSchema: ComparativeExpenseAnalysisInputSchema.omit({ model: true }),
    outputSchema: ComparativeExpenseAnalysisOutputSchema.omit({ model: true }),
  },
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  async input => {
    const llm = ai(input.model as AIModel);
    const configuredPrompt = llm.definePrompt(prompt.getDefinition());
    const {output} = await retryableAIGeneration(() => configuredPrompt(input));
=======
  async (input) => {
    const model = input.model;
    const { output } = await retryableAIGeneration(() => prompt(input, { model }));
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
    return output!;
=======
  async (input, { model }) => {
    const { output } = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }));
=======
  async (input, options) => {
    const model = options?.model;
    const { output } = await retryableAIGeneration(() => prompt(input, { model: model ? googleAI.model(model as string) : undefined }));
>>>>>>> 40cdc81 (Still the same error)
    if (!output) {
      throw new Error("AI analysis failed to produce a valid output structure.");
    }
    return output;
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
  }
);
