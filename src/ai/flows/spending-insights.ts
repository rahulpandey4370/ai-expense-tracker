
'use server';

/**
 * @fileOverview AI-powered insights about spending habits using Gemini.
 *
 * This file defines the Genkit flow for generating personalized financial insights
 * based on a user's monthly spending data. It uses a structured prompt to ensure
 * consistent and high-quality output from the AI model.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {retryableAIGeneration} from '@/ai/utils/retry-helper';

// --- Input Schema for the Flow ---
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

// --- Output Schema for the Flow ---
const SpendingInsightsOutputSchema = z.object({
  insights: z.string().describe('The final analysis text containing a numbered list of insights.'),
});

export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
  default: `You are a brutally honest, no-nonsense financial advisor from Bangalore. You give practical, direct advice. You are not afraid to call out bad spending habits but also give credit where it's due. Your goal is to help the user become financially disciplined.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. Your primary goal is to find every possible way for the user to save money. You are meticulous and focus on identifying wasteful spending and suggesting concrete reductions.`,
  growth_investor: `You are a growth-focused financial advisor. You believe that smart investing is the key to wealth. You analyze spending to find opportunities to free up capital for investments and encourage wealth-building habits.`
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
  },
  model: 'googleai/gemini-2.5-flash',
  config: {
    temperature: 0.6,
    maxOutputTokens: 1000,
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
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance.

## TASK
Analyze the user's financial data. Generate 4-6 insightful, time-aware, and actionable points.

## CONTEXT
- Today's Date: {{{currentDate}}}
- Analysis Period: {{{analysisPeriod}}}

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
{{{jsonInput}}}
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
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format

    const promptInput = {
        persona: selectedPersona,
        analysisPeriod: analysisPeriod,
        currentDate: currentDate,
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
      console.error("Input Zod validation error in getSpendingInsights:", error.flatten());
      return { insights: `There was a validation error with the data provided: ${error.message}` };
    }
    
    console.error("Error in getSpendingInsights:", error);
    
    // Check for specific error messages to provide a more user-friendly response
    if (error.message && error.message.includes("missing the insights field")) {
        return { insights: "I'm sorry, I encountered an issue generating spending insights. The AI returned an empty response." };
    }

    return { 
      insights: `I'm sorry, an unexpected error occurred while generating insights: ${error.message}` 
    };
  }
}
