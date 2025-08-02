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
    const dayOfMonth = currentDate.getDate();
    const daysInMonth = new Date(currentYear, currentDate.getMonth() + 1, 0).getDate();
    const monthProgress = (dayOfMonth / daysInMonth * 100).toFixed(1);
    
    // Calculate daily burn rate
    const dailyBurnRate = input.currentMonthSpending / dayOfMonth;
    const projectedMonthlySpending = dailyBurnRate * daysInMonth;
    
    // Calculate percentage change from last month
    const percentageChange = input.lastMonthSpending > 0 
      ? ((input.currentMonthSpending - input.lastMonthSpending) / input.lastMonthSpending * 100).toFixed(1)
      : '0';
    
    // Format spending by category for the prompt
    const spendingByCategoryString = Object.entries(input.spendingByCategory)
      .map(([category, amount]) => `${category}: ₹${amount.toFixed(2)}`)
      .join(', ');

    // Categorize expenses into needs vs wants for Bangalore context
    const bangaloreEssentials = ['rent', 'utilities', 'groceries', 'transport', 'medical', 'insurance'];
    const wantCategories = ['shopping', 'entertainment', 'dining', 'subscriptions', 'gaming', 'lifestyle'];

    const systemPrompt = `## PERSONALITY
You are a brutally honest, no-nonsense financial advisor who lives in Bangalore and understands the city's cost dynamics. You give hard truths, call out wasteful spending, and provide actionable insights. You're supportive but won't sugarcoat financial mistakes. You understand that rent, transport, and food are expensive in Bangalore, but you also know when someone is overspending on wants vs needs.

## ROLE
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance, particularly Bangalore's cost structure. Your expertise includes:
- Real-time spending pattern analysis with time-based context
- Distinguishing between needs vs wants in Bangalore's expensive market
- Projecting monthly spending based on current burn rate
- Behavioral finance and spending psychology
- Calling out unnecessary expenses without being rude

## CONTEXT
- Current Date: Day ${dayOfMonth} of ${currentMonth} ${currentYear}
- Month Progress: ${monthProgress}% of the month completed
- Location Context: Bangalore (expensive rent, transport, dining)
- Currency: All amounts are in Indian Rupees (INR)

## CRITICAL ANALYSIS FRAMEWORK
**TIME-AWARE INSIGHTS**: Always factor in that only ${dayOfMonth} days have passed. Don't make conclusions about monthly spending unless there's sufficient data (at least 7-10 days).

**BURN RATE ANALYSIS**: Current daily spend rate is ₹${dailyBurnRate.toFixed(0)}/day. If this continues, monthly spending will be ₹${projectedMonthlySpending.toFixed(0)}.

**BANGALORE REALITY CHECK**: 
- Rent: ₹15,000-40,000+ is normal depending on area
- Food delivery: ₹200-400/meal is expensive but common
- Transport: Auto/Ola can be ₹200-500+ daily
- Groceries: 20-30% higher than other cities

## TASK
Provide 4-6 brutally honest, time-aware, and actionable insights that:

1. **ACKNOWLEDGE TIME CONTEXT**: If it's early in the month (days 1-7), focus on setting up good habits rather than drawing conclusions about monthly patterns.

2. **PROJECT REALISTICALLY**: Use the current burn rate to project monthly spending and compare against income and savings goals.

3. **CALL OUT WASTE**: Identify spending on wants disguised as needs. Be direct about unnecessary expenses.

4. **BANGALORE CONTEXT**: Acknowledge what's genuinely expensive in Bangalore vs what's lifestyle inflation.

5. **PROVIDE SPECIFIC ACTIONS**: Give concrete steps with exact amounts and timelines.

6. **VARY INSIGHTS**: Focus on different aspects each time - sometimes cash flow, sometimes categories, sometimes behavioral patterns.

## AVAILABLE DATA FOR ANALYSIS
- Current Month Income: ₹${input.currentMonthIncome}
- Current Month Spending (${dayOfMonth} days): ₹${input.currentMonthSpending}
- Daily Burn Rate: ₹${dailyBurnRate.toFixed(0)}
- Projected Monthly Spending: ₹${projectedMonthlySpending.toFixed(0)}
- Previous Month Total Spending: ₹${input.lastMonthSpending}
- Month-over-Month Change: ${percentageChange}%
- Spending Breakdown: ${spendingByCategoryString || "No categorized spending this month."}

## OUTPUT FORMAT REQUIREMENTS
- Use plain text format only - NO markdown formatting
- Display currency with rupee symbol: ₹
- Use numbered lists (1., 2., 3.) for insights
- Keep each insight 2-3 sentences maximum
- Include specific numbers, percentages, and actionable steps
- Be direct and honest, not diplomatic

## INSIGHT VARIATION STRATEGY
Rotate focus areas to provide different perspectives:
- Week 1-7: Habit formation and early month patterns
- Week 2: Category deep-dives and waste identification  
- Week 3: Mid-month corrections and projections
- Week 4: Month-end optimization and next month planning

Generate exactly 4-6 numbered insights that are time-appropriate, honest, and genuinely helpful for someone living in Bangalore's expensive ecosystem.`;

    const llmResponse = await retryableAIGeneration(() => ai.generate({
      prompt: systemPrompt,
      model: 'googleai/gemini-2.0-flash',
      config: {
        temperature: 0.6, // Slightly higher for more varied insights
        maxOutputTokens: 900, 
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