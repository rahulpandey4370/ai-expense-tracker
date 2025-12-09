
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
  positiveObservations: z.array(z.string()).optional().describe("A list of 2-3 positive spending habits or trends observed this month. Can be an empty array."),
  areasForImprovement: z.array(z.string()).optional().describe("A list of 2-3 specific, actionable areas where spending could be optimized or is a potential risk. Can be an empty array."),
  keyTakeaway: z.string().optional().describe("A single, concise 'bottom line' summary of the most important financial insight for the user this month. Can be an empty string."),
});

export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
  default: `You are a balanced, practical financial advisor. You give clear, encouraging, and actionable advice.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. You are direct, blunt, and focused on finding every possible way to reduce spending and save money.`,
  growth_investor: `You are a growth-focused financial advisor. Your main goal is to help the user maximize their savings and investments. You see all un-invested money as a missed opportunity.`
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
    }),
  },
  output: { 
    schema: SpendingInsightsOutputSchema, 
  },
  model: 'googleai/gemini-2.5-flash',
  config: {
    temperature: 0.6,
    maxOutputTokens: 1200,
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
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance. Your task is to provide deep, non-obvious insights based on the user's financial data.

## CONTEXT
- **Analysis Period:** {{analysisPeriod}}
- **Today's Date:** {{currentDate}} (Use this to provide time-aware, practical advice regarding the time of the month).
- **CRITICAL RULE:** Do not just state the data back to the user. Your value is in interpretation. Find the *'so what?'* behind the numbers. Identify patterns, anti-patterns, and opportunities.

## TASK
Analyze the user's financial data for {{analysisPeriod}}. Generate a structured analysis with 2-3 positive points, 2-3 areas for improvement, and one key takeaway. Be specific and use the Rupee symbol (₹).

## OUTPUT FORMAT INSTRUCTIONS
You must output a valid JSON object matching this structure. If you have no insights for a specific section, you MUST return an empty array (for 'positiveObservations' or 'areasForImprovement') or an empty string (for 'keyTakeaway').
{
  "positiveObservations": ["Observation 1 text...", "Observation 2 text..."],
  "areasForImprovement": ["Improvement 1 text...", "Improvement 2 text..."],
  "keyTakeaway": "The single most important takeaway for the user."
}

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
    const selectedPersona =
      personas[input.insightType || 'default'] || personas['default'];
    
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const analysisPeriod = `${monthNames[input.selectedMonth]} ${input.selectedYear}`;

    const currentDate = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date());

    const promptInput = {
      persona: selectedPersona,
      analysisPeriod,
      currentDate,
      jsonInput: JSON.stringify(input, null, 2),
    };

    const result = await retryableAIGeneration(() =>
      spendingInsightsPrompt(promptInput)
    );
    
    if (!result.output) {
      console.error("AI model returned invalid structure:", JSON.stringify(result, null, 2));
      throw new Error("The AI returned a response, but it was empty or malformed.");
    }
    
    return result.output;
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
      return { 
          keyTakeaway: `Validation Error: ${error.message}` 
        };
    }
    
    console.error("Error in getSpendingInsights:", error);
    
    return { 
        keyTakeaway: `I'm sorry, an unexpected error occurred while generating insights: ${error.message}` 
    };
  }
}
