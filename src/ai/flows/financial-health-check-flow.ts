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
import { FinancialHealthCheckInputSchema, FinancialHealthCheckOutputSchema, type FinancialHealthCheckOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI } from '@/lib/azure-openai';

export async function getFinancialHealthCheck(
  input: z.infer<typeof FinancialHealthCheckInputSchema>
): Promise<FinancialHealthCheckOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  try {
    const validatedInput = FinancialHealthCheckInputSchema.omit({ model: true }).parse(input);
    const result = await financialHealthCheckFlow(input);
    return { ...result, model: modelToUse };
  } catch (flowError: any) {
    console.error("Error executing financialHealthCheckFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    if (flowError instanceof z.ZodError) {
      return {
        healthSummary: `Could not generate health check due to input errors: ${JSON.stringify(flowError.flatten().fieldErrors)}. Please check server logs.`,
        model: modelToUse,
      };
    }
    return {
      healthSummary: `An unexpected error occurred while generating the health check: ${errorMessage}`,
      model: modelToUse,
    };
  }
}

const healthCheckPromptTemplate = `You are a friendly financial assistant for FinWise AI.
Provide a concise (3-5 sentences) financial health check summary for the user based on the provided data in Indian Rupees (INR).
Your response must be in a valid JSON format.

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
`;

const financialHealthCheckFlow = ai.defineFlow(
  {
    name: 'financialHealthCheckFlow',
    inputSchema: FinancialHealthCheckInputSchema.omit({ model: true }),
    outputSchema: FinancialHealthCheckOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = (input as any).model || 'gemini-3-flash-preview';
    let output;

    if (model === 'gpt-5.2-chat') {
      output = await callAzureOpenAI(healthCheckPromptTemplate, input, FinancialHealthCheckOutputSchema.omit({ model: true }));
    } else {
      const prompt = ai.definePrompt({
        name: 'financialHealthCheckPrompt',
        input: { schema: FinancialHealthCheckInputSchema.omit({ model: true }) },
        output: { schema: FinancialHealthCheckOutputSchema.omit({ model: true }) },
        config: {
          temperature: 0.4,
          maxOutputTokens: 400,
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        },
        prompt: healthCheckPromptTemplate,
      });
      const result = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }));
      output = result.output;
    }

    if (!output) {
      throw new Error("AI analysis failed to produce a valid health check summary.");
    }
    return output;
  }
);

