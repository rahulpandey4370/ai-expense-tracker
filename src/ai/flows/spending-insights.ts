
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
  currentMonthIncome: z.number().describe('The total income for the current month in INR.'),
  currentMonthCoreSpending: z.number().describe('The total core spending (Needs + Wants) for the current month in INR.'),
  currentMonthInvestmentSpending: z.number().describe('The total amount actively invested this month (e.g., stocks, mutual funds) in INR.'),
  lastMonthCoreSpending: z.number().describe('The total core spending for the last month in INR.'),
  spendingByCategory: z.record(z.number()).describe('A JSON object mapping each core spending category to its total amount for the current month in INR. E.g., {"Food and Dining": 5000, "Shopping": 3500, "Utilities": 2000}.'),
  lastMonthSpendingByCategory: z.record(z.number()).describe('A JSON object mapping each core spending category to its total amount for the previous month in INR.'),
  insightType: z.enum(['default', 'cost_cutter', 'growth_investor']).optional().default('default'),
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
    
    // Calculate daily burn rate based on CORE SPENDING only
    const dailyBurnRate = !isHistoricMonth && currentDayOfMonth > 0 ? input.currentMonthCoreSpending / currentDayOfMonth : input.currentMonthCoreSpending / daysInSelectedMonth;
    const projectedMonthlyCoreSpending = !isHistoricMonth ? dailyBurnRate * daysInSelectedMonth : input.currentMonthCoreSpending;
    const cashSavings = input.currentMonthIncome - (input.currentMonthCoreSpending + input.currentMonthInvestmentSpending);
    
    const percentageChange = input.lastMonthCoreSpending > 0 
      ? ((input.currentMonthCoreSpending - input.lastMonthCoreSpending) / input.lastMonthCoreSpending * 100).toFixed(1)
      : '0';
      
    const spendingByCategoryString = Object.entries(input.spendingByCategory)
      .map(([category, amount]) => `${category}: ₹${amount.toFixed(2)}`)
      .join(', ');
    
    const lastMonthSpendingByCategoryString = Object.entries(input.lastMonthSpendingByCategory)
      .map(([category, amount]) => `${category}: ₹${amount.toFixed(2)}`)
      .join(', ');


    const personas = {
      default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore and understands the city's cost dynamics. You give hard truths, call out wasteful spending, and provide actionable insights. You're supportive but won't sugarcoat financial mistakes. You understand that rent, transport, and food are expensive in Bangalore, but you also know when someone is overspending on wants vs needs. Investments are NOT expenses.`,
      cost_cutter: `You are an aggressive cost-cutting financial analyst. Your single goal is to find every possible way for the user to reduce their core spending (Needs & Wants). You are ruthless in identifying non-essential expenses. You must treat investments as separate from spending and a positive outcome.`,
      growth_investor: `You are a growth-focused financial advisor. Your goal is to help the user maximize their savings and investment potential. You analyze core spending (Needs & Wants) to find money that could be re-allocated to investments. You are motivating and frame all suggestions in the context of building long-term wealth. You celebrate investment spending.`
    };
    
    const selectedPersona = personas[input.insightType || 'default'];

    const systemPrompt = `## PERSONALITY
${selectedPersona}

## ROLE
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance. Your analysis must strictly differentiate between core expenses (Needs & Wants) and Investments.

## FINANCIAL MODEL
- **Core Spending**: The money spent on 'Needs' and 'Wants'. This is the primary focus for spending analysis and reduction.
- **Investments**: Money allocated to assets like stocks, mutual funds. This is NOT an expense, but a wealth-building activity.
- **Cash Savings**: The liquid cash remaining after Core Spending and Investments are deducted from Income (Income - Core Spending - Investments).

## CONTEXT
- Analysis Period: ${monthNames[input.selectedMonth]} ${input.selectedYear}
- Location Context: Bangalore (expensive rent, transport, dining)
- Currency: All amounts are in Indian Rupees (INR)
${!isHistoricMonth ? `
## CRITICAL ANALYSIS FRAMEWORK (FOR CURRENT MONTH)
- Month Progress: The month is ${monthProgress.toFixed(0)}% complete.
- BURN RATE ANALYSIS: Your current daily spend rate on CORE expenses is ₹${dailyBurnRate.toFixed(0)}/day. If this continues, your projected CORE spending will be ₹${projectedMonthlyCoreSpending.toFixed(0)}. Frame this as a forward-looking projection.
` : `
## CRITICAL ANALYSIS FRAMEWORK (FOR HISTORICAL MONTH)
- The analysis period is in the past. Focus on a retrospective review. Do not talk about projections or burn rates.
`}
- BANGALORE REALITY CHECK: 
  - Rent: ₹15,000-40,000+ is normal
  - Food delivery: ₹200-400/meal is expensive but common
  - Transport: ₹200-500+ daily is possible

## TASK
Provide 4-6 insightful, time-aware, and actionable points based on your persona for **${monthNames[input.selectedMonth]} ${input.selectedYear}**. Your analysis must be detailed and specific.

1.  **SEPARATE INVESTMENTS**: Explicitly mention the amount invested as a positive action, separate from core spending.
2.  **ANALYZE CORE SPENDING**: Focus your main analysis on the Core Spending. Compare it to income and last month's spending.
3.  **ANALYZE THE CAUSE OF SPENDING CHANGE**: When comparing to last month, you MUST analyze the category-wise spending data for both months. Identify the top 2-3 specific categories that contributed most to any spending increase or decrease and explicitly mention them. For example, "Your spending increased mainly due to higher costs in 'Shopping' and 'Food and Dining'."
4.  **PERSONA-BASED ANALYSIS**:
    - **Default**: Call out wasteful core spending vs. genuine high costs.
    - **Cost Cutter**: Identify ALL non-essential core spending (Wants) as a target for reduction.
    - **Growth Investor**: Identify money from Core Spending that could be re-allocated to investments.
5.  **CASH SAVINGS**: Mention the final Cash Savings amount (or deficit) and what it implies about their financial situation for the month.
6.  **SPECIFIC ACTIONS**: Give concrete, actionable steps with specific INR amounts related to CORE SPENDING categories. Avoid generic advice.

## AVAILABLE DATA FOR ANALYSIS
- Period Income: ₹${input.currentMonthIncome}
- Period Core Spending (Needs+Wants): ₹${input.currentMonthCoreSpending}
- Period Investments: ₹${input.currentMonthInvestmentSpending}
- Cash Savings (Income - Core Spending - Investments): ₹${cashSavings}
- Previous Month Core Spending: ₹${input.lastMonthCoreSpending}
- Month-over-Month Change (Core Spending): ${percentageChange}%
- **Current Month Core Spending Breakdown**: ${spendingByCategoryString || "No categorized core spending this month."}
- **Previous Month Core Spending Breakdown**: ${lastMonthSpendingByCategoryString || "No categorized core spending last month."}

## OUTPUT FORMAT REQUIREMENTS
- Use plain text format only - NO markdown formatting
- Display currency with rupee symbol: ₹
- Use numbered lists (1., 2., 3.) for insights
- Each insight should be 2-3 sentences, providing detail and context.
- Be direct and honest, not diplomatic.

Generate exactly 4-6 numbered insights based on this financial model for **${monthNames[input.selectedMonth]} ${input.selectedYear}**.
`;
    // --- End of Context Generation ---

    const llmResponse = await retryableAIGeneration(() => ai.generate({
      prompt: systemPrompt,
      model: 'googleai/gemini-2.5-flash',
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
