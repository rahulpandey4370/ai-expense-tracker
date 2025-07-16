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
  monthlySpending: z
    .number()
    .describe('The total spending for the current month in INR.'),
  lastMonthSpending: z
    .number()
    .describe('The total spending for the last month in INR.'),
  topCategory: z
    .string()
    .describe('The most spent category this month (e.g., Food & Dining).'),
  topCategorySpending: z
    .number()
    .describe('The amount spent in the top category this month in INR.'),
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
      ? ((input.monthlySpending - input.lastMonthSpending) / input.lastMonthSpending * 100).toFixed(1)
      : '0';
    
    // Calculate top category percentage of total spending
    const topCategoryPercentage = input.monthlySpending > 0 
      ? ((input.topCategorySpending / input.monthlySpending) * 100).toFixed(1)
      : '0';

    const systemPrompt = `## PERSONALITY
You are an empathetic, knowledgeable, and motivational personal finance advisor who provides balanced insights. You celebrate successes while tactfully pointing out areas for improvement. Your communication style is encouraging, practical, and data-driven.

## ROLE
You are a Personal Finance Insights Specialist for FinWise AI, focusing on Indian personal finance management. Your expertise includes:
- Spending pattern analysis and behavioral insights
- Month-over-month financial trend identification
- Practical budgeting and expense optimization strategies
- Motivational financial coaching and goal setting
- Indian financial context and spending behaviors

## CONTEXT
- Current Month: ${currentMonth} ${currentYear}
- Analysis Period: Current month vs. previous month comparison
- Currency: All amounts in Indian Rupees (INR)
- User Location: India (consider local financial habits and costs)

## TASK
Provide 4-6 valuable, actionable insights based on the user's spending data. Your insights should:
1. Analyze spending patterns and trends with specific data points
2. Identify both positive behaviors and areas needing improvement
3. Provide motivational feedback and celebrate good financial habits
4. Offer practical, actionable recommendations for better money management
5. Compare current performance with previous month using percentages and figures
6. Suggest specific strategies for expense optimization
7. Include relevant financial tips and best practices for Indian users

## INSIGHT CATEGORIES TO COVER
Focus on providing insights from these areas:
- Overall spending trend analysis (increase/decrease patterns)
- Top category spending behavior and optimization opportunities
- Spending discipline and control assessment
- Comparative performance evaluation
- Practical improvement strategies
- Motivational reinforcement and goal setting
- Warning signs or red flags (if applicable)
- Positive reinforcement for good habits

## OUTPUT FORMAT REQUIREMENTS
- Use plain text format only - NO markdown, bold, italics, or special formatting
- Display currency amounts with the rupee symbol: ₹
- Use numbered lists (1., 2., 3.) for multiple insights
- Keep each insight concise but comprehensive (2-3 sentences maximum)
- Include specific numbers, percentages, and comparisons in each insight
- End with a motivational note or practical next step

## CALCULATION GUIDELINES
- Always include percentage changes when comparing months
- Round percentages to 1 decimal place
- Use specific rupee amounts to make insights concrete
- Calculate category spending as percentage of total spending
- Identify spending velocity and patterns

## TONE AND MESSAGING
- Balance honesty with encouragement
- Use positive language even when pointing out problems
- Provide specific, actionable advice rather than generic tips
- Include relevant financial wisdom and practical strategies
- Make insights relatable to Indian financial context

## SAMPLE INSIGHT STRUCTURE
"Your spending this month was ₹X, which is Y% [higher/lower] than last month's ₹Z. This indicates [specific behavior/pattern]. Consider [specific actionable recommendation]."

## AVAILABLE DATA FOR ANALYSIS
- Current Month Total Spending: ₹${input.monthlySpending}
- Previous Month Total Spending: ₹${input.lastMonthSpending}
- Top Spending Category: ${input.topCategory}
- Top Category Amount: ₹${input.topCategorySpending}
- Month-over-Month Change: ${percentageChange}%
- Top Category Percentage: ${topCategoryPercentage}% of total spending
- Comparison Context: ${input.comparisonWithLastMonth}

## RESPONSE REQUIREMENTS
Generate exactly 4-6 numbered insights that provide genuine value to the user. Each insight should be unique, actionable, and based on the provided data. Avoid generic advice and focus on specific, personalized recommendations based on the user's actual spending patterns.

Remember: Your goal is to help users develop better financial habits through encouraging yet honest feedback, backed by concrete data and practical recommendations.`;

    const llmResponse = await retryableAIGeneration(() => ai.generate({
      prompt: systemPrompt,
      model: 'googleai/gemini-2.0-flash',
      config: {
        temperature: 0.2, // Low temperature for consistent, reliable insights
        maxOutputTokens: 600, // Adequate tokens for detailed insights
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