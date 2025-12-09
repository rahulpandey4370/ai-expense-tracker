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
  spendingByCategory: z
    .record(z.number())
    .describe('A JSON object mapping each core spending category to its total amount for the current month in INR.'),
  lastMonthSpendingByCategory: z
    .record(z.number())
    .describe('A JSON object mapping each core spending category to its total amount for the previous month in INR.'),
  insightType: z
    .enum(['default', 'cost_cutter', 'growth_investor'])
    .optional()
    .default('default'),
  selectedMonth: z
    .number()
    .min(0)
    .max(11)
    .describe('The selected month for analysis (0=Jan, 11=Dec).'),
  selectedYear: z.number().describe('The selected year for analysis.'),
});

export type SpendingInsightsInput = z.infer<typeof SpendingInsightsInputSchema>;

// --- Output Schema ---
const SpendingInsightsOutputSchema = z.object({
  positiveObservations: z
    .array(z.string())
    .optional()
    .describe('A list of 2-3 positive spending habits or trends observed this month. Can be an empty array.'),
  areasForImprovement: z
    .array(z.string())
    .optional()
    .describe(
      'A list of 2-3 specific, actionable areas where spending could be optimized or is a potential risk. Can be an empty array.'
    ),
  keyTakeaway: z
    .string()
    .optional()
    .describe(
      "A single, concise 'bottom line' summary of the most important financial insight for the user this month. Can be an empty string."
    ),
});

export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
  default: `You are a balanced, practical financial advisor. You give clear, encouraging, and actionable advice.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. You are direct, blunt, and focused on finding every possible way to reduce spending and save money.`,
  growth_investor: `You are a growth-focused financial advisor. Your main goal is to help the user maximize their savings and investments. You see all un-invested money as a missed opportunity.`,
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
- Many big fixed expenses (like rent, home loan EMIs, personal loan EMIs, insurance premiums, school fees, etc.) typically occur **once a month**, often at the **start of the month**.
- **Do NOT** naively project the current spending rate linearly for the whole month, especially if:
  - It is early in the month and major fixed expenses have already gone out, or
  - The pattern clearly shows front-loaded or one-time expenses.
- Instead, reason about *how* and *when* expenses usually occur during a month, and factor that into your insights.
- **CRITICAL RULE:** Do not just restate the data. Your value is in interpretation:
  - Find the **"so what?"** behind the numbers.
  - Highlight hidden trends, anti-patterns, and opportunities the user might **easily miss**.
  - Especially call out subtle but important patterns (e.g., lifestyle creep, category drift, hidden cash leaks, under-investing).

## TASK
Analyze the user's financial data for {{analysisPeriod}}. Generate a structured analysis with:
- **2–3 Positive Observations** (good habits, healthy patterns, improvements vs last month, smart choices),
- **2–3 Areas for Improvement** (specific, actionable changes or risks),
- **1 Key Takeaway** (the single most important insight the user should remember).

You MUST:
- Return **at least 2 items** in "positiveObservations" when there is any core spending data.
- Return **at least 2 items** in "areasForImprovement" when there is any core spending data.
- If you feel there is "nothing to say", give practical, generalized but relevant advice based on the patterns you see (do NOT omit items or leave the arrays with fewer than 2 elements when spending exists).

Be concrete and use the Rupee symbol (₹). Focus on insights that are genuinely useful and sometimes non-obvious (things the user might not notice on their own).

## OUTPUT FORMAT INSTRUCTIONS
You must output a valid JSON object matching this structure.  
If you have no insights for a specific section (only if there is truly no data), you MUST still include the key for that section and:
- Use an empty array for "positiveObservations" or "areasForImprovement": []
- Use an empty string for "keyTakeaway": ""

Example valid structure:
{
  "positiveObservations": ["Observation 1 text...", "Observation 2 text..."],
  "areasForImprovement": ["Improvement 1 text...", "Improvement 2 text..."],
  "keyTakeaway": "The single most important takeaway for the user."
}

Never omit these three keys.

## USER FINANCIAL DATA
\`\`\`json
{{jsonInput}}
\`\`\`
`,
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

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const analysisPeriod = `${monthNames[input.selectedMonth]} ${input.selectedYear}`;

    // Current date in India time (Bangalore)
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

    const result = await retryableAIGeneration(() => spendingInsightsPrompt(promptInput));

    if (!result.output) {
      console.error('AI model returned invalid structure:', JSON.stringify(result, null, 2));
      throw new Error('The AI returned a response, but it was empty or malformed.');
    }

    // Normalize: always return arrays/strings so the UI can safely consume
    return {
      positiveObservations: result.output.positiveObservations ?? [],
      areasForImprovement: result.output.areasForImprovement ?? [],
      keyTakeaway: result.output.keyTakeaway ?? '',
    };
  }
);

// --- Main Export Function ---
export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  try {
    const validatedInput = SpendingInsightsInputSchema.parse(input);
    return await spendingInsightsFlow(validatedInput);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Input Zod validation error:', error.flatten());
      return {
        positiveObservations: [],
        areasForImprovement: [],
        keyTakeaway: `Validation Error: ${error.message}`,
      };
    }

    console.error('Error in getSpendingInsights:', error);

    return {
      positiveObservations: [],
      areasForImprovement: [],
      keyTakeaway: `I'm sorry, an unexpected error occurred while generating insights: ${error.message}`,
    };
  }
}
