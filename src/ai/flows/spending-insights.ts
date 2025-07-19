
'use server';

/**
 * @fileOverview AI-powered insights about spending habits.
 *
 * - getSpendingInsights - A function that provides insights into spending patterns.
 * - SpendingInsightsInput - The input type for the getSpendingInsights function.
 * - SpendingInsightsOutput - The return type for the getSpendingInsights function.
 */

import {ai}from '@/ai/genkit';
import {z}from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';

const SpendingInsightsInputSchema = z.object({
  currentMonthIncome: z
    .number()
    .describe('The total income for the current month in INR.'),
  currentMonthSpending: z
    .number()
    .describe('The total spending for the current month in INR.'),
  lastMonthSpending: z
    .number()
    .describe('The total spending for the last month in INR.'),
  spendingByCategory: z
    .record(z.number())
    .describe('A JSON object mapping each spending category to its total amount for the current month in INR. E.g., {"Food and Dining": 5000, "Shopping": 3500, "Utilities": 2000}.'),
});
export type SpendingInsightsInput = z.infer<typeof SpendingInsightsInputSchema>;

const SpendingInsightsOutputSchema = z.object({
  insights: z.string().describe('AI-powered insights about spending habits.'),
});
export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  return spendingInsightsFlow(input);
}

const spendingInsightsFlow = ai.defineFlow(
  {
    name: 'spendingInsightsFlow',
    inputSchema: SpendingInsightsInputSchema,
    outputSchema: SpendingInsightsOutputSchema,
  },
  async (input) => {
    // Get current date for context
    const currentDate = new Date();
    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const currentYear = currentDate.getFullYear();
    
    // Calculate percentage change from last month
    const percentageChange = input.lastMonthSpending > 0 
      ? ((input.currentMonthSpending - input.lastMonthSpending) / input.lastMonthSpending * 100).toFixed(1)
      : '0';
    
    // Format spending by category for the prompt
    const spendingByCategoryString = Object.entries(input.spendingByCategory)
      .map(([category, amount]) => `${category}: ₹${amount.toFixed(2)}`)
      .join(', ');

    const systemPrompt = `## PERSONALITY
You are an expert, empathetic, and motivational personal finance advisor for FinWise AI. Your goal is to uncover "hidden" insights and provide actionable advice that goes beyond the obvious. You should sound like a knowledgeable friend who is great with money.

## ROLE
You are a Personal Finance Insights Specialist for FinWise AI, specializing in Indian personal finance management. Your expertise includes:
- Deep analysis of spending patterns and behavioral finance.
- Month-over-month financial trend identification.
- Practical budgeting, savings, and investment strategies.
- Motivational financial coaching.
- Indian financial context and currency (INR).

## CONTEXT
- Current Month: ${currentMonth} ${currentYear}
- Currency: All amounts are in Indian Rupees (INR)

## TASK
Analyze the user's detailed financial data and provide 4-6 valuable, actionable, and non-obvious insights. Your insights should:
1.  Go beyond simple statements like "you spent X". Instead, analyze the *relationship* between numbers.
2.  Connect spending to income. Calculate the spend-to-income ratio and comment on its health.
3.  Identify the top 3-4 spending categories and analyze their collective impact on the budget.
4.  Compare current month's spending to the last month, providing percentage change and what it signifies.
5.  Offer specific, actionable recommendations. Instead of "spend less on food," suggest "Your Food & Dining is X% of your income. Could you try meal prepping for one week to reduce this by ₹Y?".
6.  Celebrate positive trends (e.g., lower spending, higher income) and provide encouragement.
7.  Use a friendly, conversational, and encouraging tone.

## OUTPUT FORMAT REQUIREMENTS
- Use plain text format only - NO markdown, bold, italics, or special formatting.
- Display currency amounts with the rupee symbol: ₹.
- Use numbered lists (1., 2., 3.) for the insights.
- Keep each insight concise but comprehensive (2-3 sentences maximum).
- Include specific numbers, percentages, and comparisons to make insights concrete.

## AVAILABLE DATA FOR ANALYSIS
- Current Month Total Income: ₹${input.currentMonthIncome}
- Current Month Total Spending: ₹${input.currentMonthSpending}
- Previous Month Total Spending: ₹${input.lastMonthSpending}
- Detailed Spending Breakdown by Category: ${spendingByCategoryString || "No categorized spending this month."}

## RESPONSE REQUIREMENTS
Generate exactly 4-6 numbered insights. Each insight should be unique, actionable, and based on a deep analysis of the provided data. Avoid generic advice and focus on specific, personalized recommendations based on the user's actual financial behavior.

Remember: Your goal is to empower the user by revealing patterns they might not have noticed themselves, and giving them the tools to improve their financial health.`;

    const llmResponse = await retryableAIGeneration(() => ai.generate({
      prompt: systemPrompt,
      model: 'googleai/gemini-2.0-flash',
      config: {
        temperature: 0.4, // Slightly more creative for nuanced insights
        maxOutputTokens: 800, 
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
    }));

    const responseText = llmResponse.text;
    if (!responseText) {
      console.error("AI model returned no text for spending insights");
      return { insights: "I'm sorry, I encountered an issue generating spending insights. Please try again." };
    }
    
    return { insights: responseText };
  }
);
