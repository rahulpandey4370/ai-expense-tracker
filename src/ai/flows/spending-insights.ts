
'use server';

/**
 * @fileOverview AI-powered insights about spending habits.
 *
 * - getSpendingInsights - A function that provides insights into spending patterns.
 * - SpendingInsightsInput - The input type for the getSpendingInsights function.
 * - SpendingInsightsOutput - The return type for the getSpendingInsights function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';

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
  insights: z.string().describe('AI-powered insights about spending habits, formatted as a single string containing a numbered list (1., 2., 3., etc.).'),
});
export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// Define personas for different insight types.
const personas = {
  default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore and understands the city's cost dynamics. You give hard truths, call out wasteful spending, and provide actionable insights. You're supportive but won't sugarcoat financial mistakes. You understand that rent, transport, and food are expensive in Bangalore, but you also know when someone is overspending on wants vs needs. Investments are NOT expenses.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. Your single goal is to find every possible way for the user to reduce their core spending (Needs & Wants). You are ruthless in identifying non-essential expenses. You must treat investments as separate from spending and a positive outcome.`,
  growth_investor: `You are a growth-focused financial advisor. Your goal is to help the user maximize their savings and investment potential. You analyze core spending (Needs & Wants) to find money that could be re-allocated to investments. You are motivating and frame all suggestions in the context of building long-term wealth. You celebrate investment spending.`
};

const spendingInsightsPrompt = ai.definePrompt({
  name: 'spendingInsightsPrompt',
  input: {
    schema: z.object({
        persona: z.string(),
        analysisPeriod: z.string(),
        jsonInput: z.string(), // Pass the stringified JSON here
    })
  },
  output: { schema: SpendingInsightsOutputSchema },
  config: {
    model: 'googleai/gemini-2.5-flash',
    temperature: 0.6,
    maxOutputTokens: 900,
    safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `## PERSONALITY
{{{persona}}}

## ROLE
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance. Your analysis must strictly differentiate between core expenses (Needs & Wants) and Investments.

## TASK
Analyze the user's financial data for {{{analysisPeriod}}}. Based on the data provided, generate 4-6 insightful, time-aware, and actionable points.

## RESPONSE GUIDELINES
- Your entire response MUST be a single string containing a numbered list (1., 2., 3., etc.).
- Use the Rupee symbol (₹) for all currency amounts.
- Be direct, honest, and provide specific, actionable advice based on your persona.
- Do NOT use markdown formatting.
- Base your analysis strictly on the JSON data provided.

## USER FINANCIAL DATA
\`\`\`json
{{{jsonInput}}}
\`\`\`
`
});


export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  const selectedPersona = personas[input.insightType || 'default'];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const analysisPeriod = `${monthNames[input.selectedMonth]} ${input.selectedYear}`;

  try {
    const promptInput = {
        persona: selectedPersona,
        analysisPeriod: analysisPeriod,
        jsonInput: JSON.stringify(input, null, 2),
    };
    const { output } = await retryableAIGeneration(() => spendingInsightsPrompt(promptInput));

    if (!output?.insights) {
      console.error("AI model returned no or invalid insights. Full output:", JSON.stringify(output, null, 2));
      return { insights: "I'm sorry, I encountered an issue generating spending insights. The AI returned an empty or invalid response." };
    }
    
    return output;
  } catch (error: any) {
      console.error("Error in spendingInsightsFlow during AI generation:", error);
      // This makes sure a more descriptive error message from the AI (like API key issues) is passed to the frontend.
      return { insights: `I'm sorry, an unexpected error occurred while generating insights: ${error.message || 'Unknown error'}` };
  }
}
