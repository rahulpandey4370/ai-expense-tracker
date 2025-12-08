'use server';

/**
 * @fileOverview AI-powered insights about spending habits using Gemini 2.5 Flash.
 */

import { ai } from '@/ai/genkit'; 
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';

// --- Input Schema ---
const SpendingInsightsInputSchema = z.object({
  currentMonthIncome: z.number().describe('The total income for the current month in INR.'),
  currentMonthCoreSpending: z.number().describe('The total core spending (Needs + Wants) for the current month in INR.'),
  currentMonthInvestmentSpending: z.number().describe('The total amount actively invested this month (e.g., stocks, mutual funds) in INR.'),
  lastMonthCoreSpending: z.number().describe('The total core spending for the last month in INR.'),
  spendingByCategory: z.record(z.number()).describe('A JSON object mapping each core spending category to its total amount for the current month in INR.'),
  lastMonthSpendingByCategory: z.record(z.number()).describe('A JSON object mapping each core spending category to its total amount for the previous month in INR.'),
  insightType: z.enum(['default', 'cost_cutter', 'growth_investor']).optional().default('default'),
  selectedMonth: z.number().min(0).max(11).describe("The selected month for analysis (0=Jan, 11=Dec)."),
  selectedYear: z.number().describe("The selected year for analysis."),
});

export type SpendingInsightsInput = z.infer<typeof SpendingInsightsInputSchema>;

// --- Output Schema ---
const SpendingInsightsOutputSchema = z.object({
  insights: z.string().describe('The final analysis text containing a numbered list of insights.'),
});

export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
  default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore and understands the city's cost dynamics. You give hard truths, call out wasteful spending, and provide actionable insights. You're supportive but won't sugarcoat financial mistakes. You understand that rent, transport, and food are expensive in Bangalore, but you also know when someone is overspending on wants vs needs. Investments are NOT expenses.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. Your single goal is to find every possible way for the user to reduce their core spending (Needs & Wants). You are ruthless in identifying non-essential expenses. You must treat investments as separate from spending and a positive outcome.`,
  growth_investor: `You are a growth-focused financial advisor. Your goal is to help the user maximize their savings and investment potential. You analyze core spending (Needs & Wants) to find money that could be re-allocated to investments. You are motivating and frame all suggestions in the context of building long-term wealth. You celebrate investment spending.`
};

// --- Prompt Definition ---
const spendingInsightsPrompt = ai.definePrompt({
  name: 'spendingInsightsPrompt',
  input: {
    schema: z.object({
        persona: z.string(),
        analysisPeriod: z.string(),
        currentDate: z.string(), // Added Schema field
        jsonInput: z.string(), 
    })
  },
  output: { 
    schema: SpendingInsightsOutputSchema, 
  },
  model: 'googleai/gemini-2.5-flash',
  config: {
    temperature: 0.6,
    maxOutputTokens: 2000,
    safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `## PERSONALITY
{{persona}}

## ROLE
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance.

## TASK
Analyze the user's financial data. Generate 4-6 insightful, time-aware, and actionable points.

## CONTEXT
- Today's Date: {{currentDate}} -> Use this date as context about what day of the month it is and practically give insights based on that. Yes major spends happen at the beginning of the month that doesn't mean that will continue and so on. So maintain that practicality in your analysis and insights.
- Analysis Period: {{analysisPeriod}}

## OUTPUT FORMAT INSTRUCTIONS
You must output a valid JSON object matching this structure:
{
  "insights": "1. [Insight One]\\n2. [Insight Two]\\n..."
}

Rules for the 'insights' string:
- It must be a single string.
- Use \\n for new lines between numbered items.
- Use the Rupee symbol (₹).
- Do NOT include markdown code blocks (like \`\`\`json) in the output, just the raw JSON object.

## USER FINANCIAL DATA
\`\`\`json
{{jsonInput}}
\`\`\`
`
});

// --- Flow Definition ---
const spendingInsightsFlow = ai.defineFlow(
  {
    name: 'spendingInsightsFlow',
    inputSchema: SpendingInsightsInputSchema,
    outputSchema: SpendingInsightsOutputSchema,
  },
  async (input) => {
    const selectedPersona = personas[input.insightType || 'default'] || personas['default'];
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const analysisPeriod = `${monthNames[input.selectedMonth]} ${input.selectedYear}`;
    
    // Added Date generation
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format

    const promptInput = {
        persona: selectedPersona,
        analysisPeriod: analysisPeriod,
        currentDate: currentDate, // Added to prompt input
        jsonInput: JSON.stringify(input, null, 2),
    };

    const { output } = await retryableAIGeneration(() => spendingInsightsPrompt(promptInput));
    
    if (!output || !output.insights) {
      console.error("AI model returned invalid structure:", JSON.stringify(output, null, 2));
      throw new Error("The AI returned a response, but it was missing the insights field.");
    }
    
    return output;
  }
);

// --- Main Export Function ---
export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  try {
    const validatedInput = SpendingInsightsInputSchema.parse(input);
    return await spendingInsightsFlow(validatedInput);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error("Input Zod validation error:", error.flatten());
      return { insights: `Validation Error: ${error.message}` };
    }
    
    console.error("Error in getSpendingInsights:", error);
    
    return { 
      insights: `I encountered an issue generating your insights using Gemini 2.5 Flash. Please try again. (Error: ${error.message})` 
    };
  }
}