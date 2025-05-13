// 'use server';

/**
 * @fileOverview AI-powered insights about spending habits.
 *
 * - getSpendingInsights - A function that provides insights into spending patterns.
 * - SpendingInsightsInput - The input type for the getSpendingInsights function.
 * - SpendingInsightsOutput - The return type for the getSpendingInsights function.
 */

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SpendingInsightsInputSchema = z.object({
  monthlySpending: z
    .number()
    .describe('The total spending for the current month in USD.'),
  lastMonthSpending: z
    .number()
    .describe('The total spending for the last month in USD.'),
  topCategory: z
    .string()
    .describe('The most spent category this month (e.g., Food & Dining).'),
  topCategorySpending: z
    .number()
    .describe('The amount spent in the top category this month in USD.'),
  comparisonWithLastMonth: z
    .string()
    .describe(
      'A brief comparison of spending this month compared to last month.'
    ),
});
export type SpendingInsightsInput = z.infer<typeof SpendingInsightsInputSchema>;

const SpendingInsightsOutputSchema = z.object({
  insights: z.string().describe('AI-powered insights about spending habits.'),
});
export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  return spendingInsightsFlow(input);
}

const spendingInsightsPrompt = ai.definePrompt({
  name: 'spendingInsightsPrompt',
  input: {schema: SpendingInsightsInputSchema},
  output: {schema: SpendingInsightsOutputSchema},
  prompt: `You are a personal finance advisor providing insights to the user about their spending habits.

  Here is the user's spending data for the current month:
  - Total spending: ${'{{monthlySpending}}'} USD
  - Top category: ${'{{topCategory}}'} (${'{{topCategorySpending}}'} USD)

  Compared to last month (spending: ${'{{lastMonthSpending}}'} USD), ${'{{comparisonWithLastMonth}}'}.

  Provide 2-3 concise and actionable insights to help the user understand their spending patterns and make informed decisions.
`,
});

const spendingInsightsFlow = ai.defineFlow(
  {
    name: 'spendingInsightsFlow',
    inputSchema: SpendingInsightsInputSchema,
    outputSchema: SpendingInsightsOutputSchema,
  },
  async input => {
    const {output} = await spendingInsightsPrompt(input);
    return output!;
  }
);
