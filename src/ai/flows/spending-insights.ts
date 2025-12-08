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
// We keep the description simple so the model knows exactly what to put in the string.
const SpendingInsightsOutputSchema = z.object({
  insights: z.string().describe('A single string containing a numbered list (1., 2., 3.) of financial insights, separated by newline characters (\\n).'),
});

export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
  default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore. You give hard truths, call out wasteful spending, and provide actionable insights. You understand that rent, transport, and food are expensive in Bangalore, but you also know when someone is overspending on wants vs needs.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. Your single goal is to find every possible way for the user to reduce their core spending (Needs & Wants). You are ruthless in identifying non-essential expenses.`,
  growth_investor: `You are a growth-focused financial advisor. Your goal is to help the user maximize their savings and investment potential. You analyze core spending to find money that could be re-allocated to investments.`
};

// --- Prompt Definition ---
const spendingInsightsPrompt = ai.definePrompt({
  name: 'spendingInsightsPrompt',
  input: {
    schema: z.object({
        persona: z.string(),
        analysisPeriod: z.string(),
        currentDate: z.string(),
        jsonInput: z.string(), 
    })
  },
  output: { 
    schema: SpendingInsightsOutputSchema,
    format: 'json', // CRITICAL FIX: Explicitly enforce JSON mode
  },
  model: 'googleai/gemini-2.5-flash',
  config: {
    temperature: 0.5, // Lower temperature slightly to ensure formatting stability
    maxOutputTokens: 2000,
    // Note: safetySettings are standard, keeping them ensures the model doesn't block valid financial critique
    safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `## SYSTEM ROLE
You are an expert financial AI. You must output valid JSON only.

## PERSONALITY
{{persona}}

## CONTEXT
- **Today's Date:** {{currentDate}} (Use this to provide time-aware, practical advice regarding the time of the month).
- **Analysis Period:** {{analysisPeriod}}

## INSTRUCTIONS
Analyze the provided JSON financial data. Generate 4-6 insightful, actionable points formatted as a numbered list.
Use the Rupee symbol (₹) for amounts.

## DATA
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
    
    // Date Logic
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

    const promptInput = {
        persona: selectedPersona,
        analysisPeriod: analysisPeriod,
        currentDate: currentDate,
        jsonInput: JSON.stringify(input, null, 2),
    };

    // We use retryable generation to handle transient model glitches
    const { output } = await retryableAIGeneration(() => spendingInsightsPrompt(promptInput));
    
    // Strict validation
    if (!output || typeof output !== 'object' || !output.insights) {
      // If we are here, Genkit failed to parse JSON or model returned empty
      console.error("AI Model Output Failure. Raw Output:", output);
      throw new Error("The AI model failed to generate a valid JSON response containing insights.");
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
    // Detailed error logging
    if (error instanceof z.ZodError) {
      console.error("Input Zod Validation Error:", error.flatten());
      return { insights: `Input Error: ${error.message}` };
    }
    
    console.error("Critical Error in getSpendingInsights:", error);
    
    // Friendly fallback
    return { 
      insights: `I'm sorry, I couldn't analyze your spending at this moment. (System Error: ${error.message})` 
    };
  }
}