
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
import { getDaysInMonth, isPast } from 'date-fns';


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
  insightType: z.enum(['default', 'cost_cutter', 'growth_investor']).optional().default('default'),
  // Add selected month and year to the input schema
  selectedMonth: z.number().min(0).max(11).describe("The selected month for analysis (0=Jan, 11=Dec)."),
  selectedYear: z.number().describe("The selected year for analysis."),
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
    // --- Context Generation moved inside the flow ---
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentDate = new Date();
    const selectedDate = new Date(input.selectedYear, input.selectedMonth, 1);
    
    const isHistoricMonth = isPast(new Date(input.selectedYear, input.selectedMonth + 1, 0));
    
    const currentDayOfMonth = currentDate.getDate();
    const daysInSelectedMonth = getDaysInMonth(selectedDate);
    const monthProgress = isHistoricMonth ? 100 : (currentDayOfMonth / daysInSelectedMonth * 100);
    
    // Calculate daily burn rate only if it's the current month
    const dailyBurnRate = !isHistoricMonth ? input.currentMonthSpending / currentDayOfMonth : input.currentMonthSpending / daysInSelectedMonth;
    const projectedMonthlySpending = !isHistoricMonth ? dailyBurnRate * daysInSelectedMonth : input.currentMonthSpending;
    
    const percentageChange = input.lastMonthSpending > 0 
      ? ((input.currentMonthSpending - input.lastMonthSpending) / input.lastMonthSpending * 100).toFixed(1)
      : '0';
      
    const spendingByCategoryString = Object.entries(input.spendingByCategory)
      .map(([category, amount]) => `${category}: ₹${amount.toFixed(2)}`)
      .join(', ');

    const personas = {
      default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore and understands the city's cost dynamics. You give hard truths, call out wasteful spending, and provide actionable insights. You're supportive but won't sugarcoat financial mistakes. You understand that rent, transport, and food are expensive in Bangalore, but you also know when someone is overspending on wants vs needs.`,
      cost_cutter: `You are an aggressive cost-cutting financial analyst. Your single goal is to find every possible way for the user to reduce their spending. You are ruthless in identifying non-essential expenses and suggesting drastic measures to save money. You should highlight every 'want' as a potential area for cuts.`,
      growth_investor: `You are a growth-focused financial advisor. Your goal is to help the user maximize their savings and investment potential. You analyze spending to find money that could be re-allocated to investments. You are motivating and frame all suggestions in the context of building long-term wealth.`
    };
    
    const selectedPersona = personas[input.insightType || 'default'];

    const systemPrompt = `## PERSONALITY
${selectedPersona}

## ROLE
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance, particularly Bangalore's cost structure. Your expertise includes:
- Spending pattern analysis based on a specific month's data.
- Distinguishing between needs vs wants in Bangalore's expensive market.
- Behavioral finance and spending psychology.
- Calling out unnecessary expenses without being rude.

## CONTEXT
- Analysis Period: ${monthNames[input.selectedMonth]} ${input.selectedYear}
- Location Context: Bangalore (expensive rent, transport, dining)
- Currency: All amounts are in Indian Rupees (INR)
${!isHistoricMonth ? `
## CRITICAL ANALYSIS FRAMEWORK (FOR CURRENT MONTH)
- Month Progress: ${monthProgress.toFixed(1)}% of the month completed as of today.
- TIME-AWARE INSIGHTS: Always factor in that only ${currentDayOfMonth} days have passed. Don't make conclusions about monthly spending unless there's sufficient data (at least 7-10 days). If it's early in the month, acknowledge large one-time expenses like 'Rent' as such and not use them to make alarming 'burn rate' projections.
- BURN RATE ANALYSIS: Current daily spend rate is ₹${dailyBurnRate.toFixed(0)}/day. If this continues, monthly spending will be ₹${projectedMonthlySpending.toFixed(0)}. Frame this as a projection, not a certainty.
` : `
## CRITICAL ANALYSIS FRAMEWORK (FOR HISTORICAL MONTH)
- The analysis period is in the past. Focus on a retrospective review of what happened. Do not talk about projections or burn rates.
- Identify key trends, major spending categories, and potential areas for future improvement based on this past data.
`}
- BANGALORE REALITY CHECK: 
  - Rent: ₹15,000-40,000+ is normal depending on area
  - Food delivery: ₹200-400/meal is expensive but common
  - Transport: Auto/Ola can be ₹200-500+ daily
  - Groceries: 20-30% higher than other cities

## TASK
Provide 4-6 insightful, time-aware, and actionable points based on your persona for the period of **${monthNames[input.selectedMonth]} ${input.selectedYear}**.

1.  **ACKNOWLEDGE TIME CONTEXT**: Analyze based on whether it's the current, ongoing month or a completed historical month.
2.  **PROJECT REALISTICALLY (if current month)**: If analyzing the current month, use the burn rate to project monthly spending and compare against income. Acknowledge one-time large expenses. For historical months, do not project.
3.  **ANALYZE BASED ON PERSONA**:
    - **Default**: Call out waste vs. genuine high costs.
    - **Cost Cutter**: Identify ALL non-essential spending (anything in 'Wants' category) as a target for reduction.
    - **Growth Investor**: Identify money spent on 'Wants' that could be re-allocated to investments.
4.  **PROVIDE SPECIFIC ACTIONS**: Give concrete steps with exact amounts and timelines.
5.  **VARY INSIGHTS**: Focus on different aspects - cash flow, categories, behavioral patterns.

## AVAILABLE DATA FOR ANALYSIS
- Period Income: ₹${input.currentMonthIncome}
- Period Spending: ₹${input.currentMonthSpending}
- Previous Month Total Spending: ₹${input.lastMonthSpending}
- Month-over-Month Change: ${percentageChange}%
- Period Spending Breakdown: ${spendingByCategoryString || "No categorized spending this month."}

## OUTPUT FORMAT REQUIREMENTS
- Use plain text format only - NO markdown formatting
- Display currency with rupee symbol: ₹
- Use numbered lists (1., 2., 3.) for insights
- Keep each insight 2-3 sentences maximum
- Include specific numbers, percentages, and actionable steps
- Be direct and honest, not diplomatic

Generate exactly 4-6 numbered insights that are time-appropriate, honest, and genuinely helpful for someone living in Bangalore's expensive ecosystem for the month of **${monthNames[input.selectedMonth]} ${input.selectedYear}**.
`;
    // --- End of Context Generation ---

    const llmResponse = await retryableAIGeneration(() => ai.generate({
      prompt: systemPrompt,
      model: 'googleai/gemini-2.0-flash',
      config: {
        temperature: 0.6,
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
